# Vieew Backend

Backend infrastructure for a global social platform supporting content creation, advertising, and token-based rewards.

## Architecture Overview

```
Frontend Apps ──→ AWS AppSync (GraphQL) ──→ Lambda Functions
                         │                        │
                         ▼                        ▼
                   DynamoDB Tables ←──── DynamoDB Streams
                         │                        │
                         ▼                        ▼
                   User/Mining Data        EventBridge Scheduler
                                                  │
                                                  ▼
                                          Token Distribution
```

### Core Components
- **Authentication**: AWS Cognito with social providers
- **API**: GraphQL via AWS AppSync
- **Database**: DynamoDB with real-time streams
- **Functions**: Lambda for business logic
- **Scheduling**: EventBridge for automated mining rewards

## Key Features

### Mining System
- 24-hour mining sessions with automatic token distribution
- Phase-based rewards: 24 tokens (0-10k users) → 20 tokens (10k-20k) → 16 tokens (20k-30k) → 12 tokens (30k-60k) → 8 tokens (60k-100k) → 6 tokens (100k+)
- Streak bonuses: +20% for 7 consecutive days
- Social multipliers: +20% per active referral (max 20)

### Referral System
- Unique referral codes per user
- Track invited users vs active miners
- Real-time analytics with date filtering

### Entity Management
- Business entity requests (Vieewer, Ads, Agency)
- Admin approval workflow
- Automatic entity creation

## Project Structure

```
amplify/
├── auth/                    # Cognito + triggers
├── data/resource.ts         # GraphQL schema
├── functions/
│   ├── increment-user-count/
│   ├── process-entity-request/
│   ├── process-mining-session/    # Token distribution
│   ├── referral-stats-service/
│   └── schedule-mining-session/   # Mining scheduler
├── storage/                 # S3 configuration
└── backend.ts              # Infrastructure setup
```

## Getting Started

### Prerequisites
- Node.js 18+
- AWS CLI configured
- Amplify CLI: `npm install -g @aws-amplify/cli`

### Local Development
```bash
# Clone and install
git clone <repo-url>
cd vieew-backend
npm install

# Start sandbox
npx ampx sandbox

# View logs
npx ampx sandbox --stream-function-logs
```

### Frontend Integration
```typescript
// In your frontend tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/amplify_outputs": ["../vieew-backend/amplify_outputs.json"]
    }
  }
}

// Generate outputs for frontend development
npx ampx generate outputs --branch <branch> --app-id <app-id>
```

## Data Models

### User
- `userId`, `email`, `firstName`, `lastName`
- `referralCode`, `referredByUserCode`
- `balance` (token balance)
- `miningSessions` relationship

### MiningSession
- 24-hour sessions with `startDate`, `endDate`
- Status: `PROGRESS` → `PROCESSING` → `PROCESSED`
- Automatic scheduling via EventBridge

### Entity/EntityRequest
- Business entities with approval workflow
- Types: `VIEEWER`, `ADS`, `AGENCY`

## API

### Key Queries
```graphql
getReferralStats(referralCode: String!, startDate?: DateTime, endDate?: DateTime)
# Returns: { allInvitedUsers: [String], allMininngUsers: [String] }
```

### Key Indexes
- `listUsersReferredByCode` - Find users by referral code
- `listMiningSessionsByUserId` - User's mining history
- `getUserByEmail`, `getUserBySub` - User lookups

## Deployment

### Environments
- **Sandbox**: `npx ampx sandbox` (development)
- **Staging**: `npx ampx pipeline-deploy --branch main` 
- **Production**: `npx ampx pipeline-deploy --branch main` (with approvals)

### Environment Variables
Functions automatically receive:
- `MINING_TABLE_NAME`, `USERS_TABLE_NAME`, `APPDATA_TABLE_NAME`
- `ROLE_ARN`, `TARGET_ARN` (for EventBridge scheduling)

## Token Economics

| User Count | Base Reward | With Social Bonus | With Streak |
|------------|-------------|-------------------|-------------|
| 0-10k      | 24 tokens   | up to 120 tokens  | +20%        |
| 10k-20k    | 20 tokens   | up to 100 tokens  | +20%        |
| 20k-30k    | 16 tokens   | up to 80 tokens   | +20%        |
| 30k-60k    | 12 tokens   | up to 60 tokens   | +20%        |
| 60k-100k   | 8 tokens    | up to 40 tokens   | +20%        |
| 100k+      | 6 tokens    | up to 30 tokens   | +20%        |

## Development Notes

### Key Workflows
1. **User signs up** → triggers create user record + referral code
2. **User starts mining** → creates MiningSession → schedules EventBridge rule
3. **24h later** → EventBridge triggers token distribution → updates user balance
4. **Entity request** → admin approves → auto-creates Entity record

### Stream Processing
- **User table** → increments global user count
- **EntityRequest table** → processes approvals
- **MiningSession table** → schedules token distribution

### Authorization
- Owner-based: users access their own data
- Admin group: for entity approvals
- Resource-based: Lambda functions have table permissions

## Troubleshooting

### Common Issues
- **Permission errors**: Check IAM roles in `backend.ts`
- **Schema changes**: Run `npx ampx sandbox` to apply
- **Function errors**: Check CloudWatch logs

### Debug Commands
```bash
npx ampx sandbox logs --function <function-name>
npx ampx sandbox status
```