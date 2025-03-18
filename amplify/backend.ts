import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { seed } from './functions/seed/resource';
import { schedulerMining } from './functions/scheduler-mining/resource';
import { distributeTokens } from './functions/distribute-tokens/resource';
import { entityRequestStreams } from './functions/entity-request-streams/resource';
import { getReferralStats } from './functions/get-referral-stats/resource';
import { Stack } from "aws-cdk-lib";
import { Policy, PolicyStatement, Effect, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { StartingPosition, EventSourceMapping } from "aws-cdk-lib/aws-lambda";

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  seed, 
  entityRequestStreams,
  schedulerMining,
  distributeTokens,
  getReferralStats
});

  
// STREAM EVENTS FROM ENTITY REQUEST TABLE
const entityRequestTable = backend.data.resources.tables["EntityRquest"];

const entityRequestStreamsPolicy = new Policy(
  Stack.of(entityRequestTable),
  "EntityRequestStreamingPolicy",
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams",
        ],
        resources: ["*"],
      }),
    ],
  }
);
backend.entityRequestStreams.resources.lambda.role?.attachInlinePolicy(entityRequestStreamsPolicy);

const EntityRequestEventStreamMapping = new EventSourceMapping(
  Stack.of(entityRequestTable),
  "EntityRequestEventStreamMapping",
  {
    target: backend.entityRequestStreams.resources.lambda,
    eventSourceArn: entityRequestTable.tableStreamArn,
    startingPosition: StartingPosition.LATEST,
  }
);

EntityRequestEventStreamMapping.node.addDependency(entityRequestStreamsPolicy);

/** 
*     
*     VIEEW-MINING feature - build resources
*     
*  1. User updates MiningSessions table with a new mining sessionn that lasts 24h   
*  2. When INSERT event, create EventBridge rule (scheduler-mining) to execute
*     the recompensation mechanism (distribute-tokens)
*  3.    
*     
*     
*/

// STREAM EVENTS FROM MINING SESSIONS TABLE
const miningSessionsTable = backend.data.resources.tables["MiningSession"];

// new policy with rights on DynamoDB
const miningSessionStreamsPolicy = new Policy(
  Stack.of(miningSessionsTable),
  "MiningSessionsStreamingPolicy",
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams",
        ],
        resources: ["*"],
      }),
    ],
  }
);
// assigning the policy to the function
backend.schedulerMining.resources.lambda.role?.attachInlinePolicy(miningSessionStreamsPolicy);

// create trigger to execute the fuction
const SchedulerMiningEventStreamMapping = new EventSourceMapping(
  Stack.of(miningSessionsTable),
  "SchedulerMiningEventStreamMapping",
  {
    target: backend.schedulerMining.resources.lambda,
    eventSourceArn: miningSessionsTable.tableStreamArn,
    startingPosition: StartingPosition.LATEST,
  }
);

SchedulerMiningEventStreamMapping.node.addDependency(miningSessionStreamsPolicy);

// --------------------------------------------------------------------------------


// ADD RIGHTS TO EVENT BRIDGE TO INVOKE DISTRIBUTE-TOKENS FUCTION
const distributeTokensFunction = backend.distributeTokens.resources.lambda

// Create EventBridge execution role
const eventBridgeExecutionRole = new Role(
  Stack.of(distributeTokensFunction), 
  'EventBridgDistributeTokensExecutionRole', {
  assumedBy: new ServicePrincipal('events.amazonaws.com'),
  description: 'Role for EventBridge to execute distributeTokens function',
});

// Add permission to invoke the Lambda function
eventBridgeExecutionRole.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['lambda:InvokeFunction'],
    resources: [distributeTokensFunction.functionArn],
  })
);

// ADDINNG RIGHTS TO SCHEDULE-MINING TO CREATE EVENT-BRIDGE SCHEDULES

const schedulerMiningFunction = backend.schedulerMining.resources.lambda

// Add rights to scheduleMiner to work with EventBridge and put the roleArn on 
const schedulerMiningPolicy = new Policy(
  Stack.of(schedulerMiningFunction),
  "ScheduleMiningPolicy",
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "events:PutRule",
          "events:PutTargets",
          "events:DeleteRule",
          "events:RemoveTargets"
        ],
        resources: ["*"],
      }),
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: [eventBridgeExecutionRole.roleArn],
      })
    ],
  }
);

schedulerMiningFunction.role?.attachInlinePolicy(schedulerMiningPolicy);

// ENV VARIABLES <3
backend.schedulerMining.addEnvironment("ROLE_ARN", eventBridgeExecutionRole.roleArn);
backend.schedulerMining.addEnvironment("TARGET_ARN", distributeTokensFunction.functionArn);

