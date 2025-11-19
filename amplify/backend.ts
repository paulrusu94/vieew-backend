import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { processMiningSession } from './functions/process-mining-session/resource';
import { scheduleMiningSession } from './functions/schedule-mining-session/resource';
import { processEntityRequest } from './functions/process-entity-request/resource';
import { referralStatsService } from './functions/referral-stats-service/resource';
import { preSignUp } from './auth/pre-signup/resource';
import { postAuthentication } from './auth/post-authentication/resource';
import { incrementUserCount } from './functions/increment-user-count/resource';
import { Stack } from "aws-cdk-lib";
import { Policy, PolicyStatement, Effect, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { StartingPosition, EventSourceMapping } from "aws-cdk-lib/aws-lambda";



const backend = defineBackend({
  auth,
  data,
  storage,
  processEntityRequest,
  scheduleMiningSession,
  processMiningSession,
  referralStatsService,
  preSignUp,
  postAuthentication,
  incrementUserCount
});

    

// === GIVE PreSignUp LAMBDA PERMISSIONS ON THE USER POOL ===

// Build a specific ARN for the user pool (preferred)
const { cfnUserPool } = backend.auth.resources.cfnResources;
const userPoolArn = cfnUserPool.attrArn;

const preSignUpPolicy = new Policy(
  Stack.of(backend.preSignUp.resources.lambda),
  'PreSignUpLinkPolicy',
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'cognito-idp:ListUsers',
          'cognito-idp:AdminLinkProviderForUser',
        ],
        resources: [userPoolArn], // you can temporarily put "*" if you’re blocked
      }),
    ],
  }
);

const postAuthenticationPolicy = new Policy(
  Stack.of(backend.postAuthentication.resources.lambda),
  'PostAuthenticationLinkPolicy',
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'cognito-idp:AdminUpdateUserAttributes',
        ],
        resources: [userPoolArn], // you can temporarily put "*" if you’re blocked
      }),
    ],
  }
);

// attach to the trigger Lambda role
backend.preSignUp.resources.lambda.role?.attachInlinePolicy(preSignUpPolicy);
backend.postAuthentication.resources.lambda.role?.attachInlinePolicy(postAuthenticationPolicy)

  
// STREAM EVENTS FROM ENTITY REQUEST TABLE
const entityRequestTable = backend.data.resources.tables["EntityRequest"];

if (!entityRequestTable?.tableStreamArn) {
  throw new Error("EntityRequest table stream ARN is not available");
}

const processEntityRequestPolicy = new Policy(
  Stack.of(backend.processEntityRequest.resources.lambda),
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
        resources: [entityRequestTable.tableStreamArn],
      }),
    ],
  }
);
backend.processEntityRequest.resources.lambda.role?.attachInlinePolicy(processEntityRequestPolicy);

const EntityRequestEventStreamMapping = new EventSourceMapping(
  Stack.of(backend.processEntityRequest.resources.lambda),
  "EntityRequestEventStreamMapping",
  {
    target: backend.processEntityRequest.resources.lambda,
    eventSourceArn: entityRequestTable.tableStreamArn,
    startingPosition: StartingPosition.LATEST,
  }
);

EntityRequestEventStreamMapping.node.addDependency(processEntityRequestPolicy);

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
  Stack.of(backend.scheduleMiningSession.resources.lambda),
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
        resources: [miningSessionsTable.tableStreamArn!],
      }),
    ],
  }
);
// assigning the policy to the function
backend.scheduleMiningSession.resources.lambda.role?.attachInlinePolicy(miningSessionStreamsPolicy);

// create trigger to execute the fuction
const scheduleMiningSessionEventStreamMapping = new EventSourceMapping(
  Stack.of(backend.scheduleMiningSession.resources.lambda),
  "scheduleMiningSessionEventStreamMapping",
  {
    target: backend.scheduleMiningSession.resources.lambda,
    eventSourceArn: miningSessionsTable.tableStreamArn,
    startingPosition: StartingPosition.LATEST,
  }
);

scheduleMiningSessionEventStreamMapping.node.addDependency(miningSessionStreamsPolicy);

// --------------------------------------------------------------------------------


// ADD RIGHTS TO EVENT BRIDGE TO INVOKE DISTRIBUTE-TOKENS FUCTION
const processMiningSessionFunction = backend.processMiningSession.resources.lambda


// ADD PERMISSIONS FOR DISTRIBUTE-TOKENS TO ACCESS DYNAMODB TABLES
const processMiningSessionPolicy = new Policy(
  Stack.of(processMiningSessionFunction),
  "DistributeTokensPolicy",
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ],
        resources: [
          backend.data.resources.tables["MiningSession"].tableArn,
          backend.data.resources.tables["User"].tableArn
        ],
      }),
    ],
  }
);

processMiningSessionFunction.role?.attachInlinePolicy(processMiningSessionPolicy);

backend.processMiningSession.addEnvironment(
  "MINING_TABLE_NAME",
  backend.data.resources.tables["MiningSession"].tableName
);
backend.processMiningSession.addEnvironment(
  "USERS_TABLE_NAME",
  backend.data.resources.tables["User"].tableName
);  


// Create EventBridge execution role
const eventBridgeExecutionRole = new Role(
  Stack.of(processMiningSessionFunction), 
  'EventBridgDistributeTokensExecutionRole', {
  assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
  description: 'Role for EventBridge to execute processMiningSession function',
});

// Add permission to invoke the Lambda function
eventBridgeExecutionRole.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['lambda:InvokeFunction'],
    resources: [processMiningSessionFunction.functionArn],
  })
);

// ADDINNG RIGHTS TO SCHEDULE-MINING TO CREATE EVENT-BRIDGE SCHEDULES

const scheduleMiningSessionFunction = backend.scheduleMiningSession.resources.lambda

// Add rights to scheduleMiner to work with EventBridge Scheduler and put the roleArn on 
const scheduleMiningSessionPolicy = new Policy(
  Stack.of(scheduleMiningSessionFunction),
  "ScheduleMiningPolicy",
  {
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "scheduler:CreateSchedule",
          "scheduler:UpdateSchedule",
          "scheduler:DeleteSchedule",
          "scheduler:GetSchedule",
          "scheduler:ListSchedules"
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

scheduleMiningSessionFunction.role?.attachInlinePolicy(scheduleMiningSessionPolicy);

// ENV VARIABLES <3
backend.scheduleMiningSession.addEnvironment("ROLE_ARN", eventBridgeExecutionRole.roleArn);
backend.scheduleMiningSession.addEnvironment("TARGET_ARN", processMiningSessionFunction.functionArn);

// USER TABLE STREAM -> INCREMENT USER COUNT
const userTable = backend.data.resources.tables["User"];
const incrementUserCountLambda = backend.incrementUserCount.resources.lambda;

// 1) Permisiuni pe stream + AppData (totul în stack-ul funcției)
const incrementUserCountPolicy = new Policy(
  Stack.of(incrementUserCountLambda),
  "IncrementUserCountPolicy",
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
        resources: [userTable.tableStreamArn!],
      }),
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "dynamodb:UpdateItem",
          "dynamodb:PutItem",
          "dynamodb:GetItem",
        ],
        resources: [
          backend.data.resources.tables["AppData"].tableArn,
        ],
      }),
    ],
  }
);

incrementUserCountLambda.role?.attachInlinePolicy(incrementUserCountPolicy);

// 2) EventSourceMapping de la stream-ul User la funcție
const userTableStreamMapping = new EventSourceMapping(
  Stack.of(incrementUserCountLambda),
  "UserTableIncrementUserCountMapping",
  {
    target: incrementUserCountLambda,
    eventSourceArn: userTable.tableStreamArn,
    startingPosition: StartingPosition.LATEST,
  }
);

userTableStreamMapping.node.addDependency(incrementUserCountPolicy);

backend.incrementUserCount.addEnvironment(
  "APPDATA_TABLE_NAME",
  backend.data.resources.tables["AppData"].tableName
);

