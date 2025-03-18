import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { postConfirmation } from "../auth/post-connfirmation/resource";
import { seed } from "../functions/seed/resource";
import { getReferralStats } from "../functions/get-referral-stats/resource";
import { entityRequestStreams } from "../functions/entity-request-streams/resource";
import { schedulerMining } from "../functions/scheduler-mining/resource";
import { distributeTokens } from "../functions/distribute-tokens/resource";

const schema = a.schema({
  EntityTypes: a
    .enum([
      "VIEEWER",
      "ADS",
      "AGENCY"
    ]),
  EntityRequestStatus: a
    .enum([
      "REVIEW",
      "REJECTED",
      "DONE"
    ]),
  PostTypes: a
    .enum([
      "TEXT",
      "MEDIA_PHOTO",
      "MEDIA",
    ]),
  PostStatus: a
    .enum([
      "IN_DRAFT",
      "IN_REVIEW",
      "IN_ARCHIVE",
      "IN_FEED"
    ]),
  MediaContentTypes: a
    .enum([
      "image_png",
      "image_jpg",
      "video_mp4"
    ]),
  ReferralStatsResponse: a.customType({
    allInvitedUsers: a.string().array().required(),
    allMininngUsers: a.string().array().required()
  }),
  getReferralStats: a.query()
      .arguments({
        startDate: a.datetime(),
        endDate: a.datetime(),
        referralCode: a.string()
      })
      .returns(a.ref('ReferralStatsResponse'))
      .handler(a.handler.function(getReferralStats))
      .authorization(allow => [
        allow.authenticated("userPools"),
        allow.authenticated("identityPool")
      ]),  
  User: a
    .model({
      userId: a.id().required(),
      email: a.string().required(),
      sub: a.string().authorization(allow => [
        allow.ownerDefinedIn("owner").to(["update", "read"])
      ]),
      firstName: a.string().required(),
      lastName: a.string().required(),
      entities: a.hasMany("Entity", "ownerId").authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["read"])
      ]),
      posts: a.hasMany("Post", "authorId"),
      medias: a.hasMany("Media", "ownerId"),
      entityRequests: a.hasMany("EntityRquest", "ownerId").authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["read"])
      ]),
      owner: a.string().authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["read"])
      ]),
      hide: a.string().authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["update", "read"])
      ]),
      balance: a.float().default(0).authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["read"])
      ]),
      referralCode: a.string().authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["read"])
      ]),
      referredByUserCode: a.string().authorization((allow) => [
        allow.ownerDefinedIn("owner").to(["read"])
      ]),
      miningSessions: a.hasMany("MiningSession", "userId"),
      
    })
    .identifier(["userId"])
    .secondaryIndexes(index => [
      index("referredByUserCode").queryField("listUsersReferredByCode"),
      index("referralCode").queryField("getUserByreferralCode"),
      index("email").queryField("getUserByEmail"),
      index("sub").queryField("getUserBySub")
    ])
    .authorization((allow) => [
      allow.guest().to(["read"]),
      allow.authenticated("identityPool").to(["read"]),
      allow.authenticated("userPools").to(["read"]),
      allow.ownerDefinedIn("owner").to(["update", "read"])
    ]),
  MiningSession: a.model({
    miningSessionId: a.id().required(),
    type: a.string().default("MiningSession"),
    userId: a.string().required(),
    startDate: a.datetime().required(),
    user: a.belongsTo("User", "userId"),
    endDate: a.datetime(),
    status: a.enum(["PROGRESS", "DONE"]),
    allInvitedUser:  a.string().array(),
    allInvitedMinedUsers: a.string().array(),
  })
    .identifier(["miningSessionId"])
    .secondaryIndexes((index) => [
      index("userId").queryField("listMiningSessionsByUserId").sortKeys(["startDate"])
    ])
    .authorization((allow) => [
      allow.authenticated("userPools").to(["create"]),
      allow.ownerDefinedIn("userId").to(["read"])
    ]),
  Post: a.model({
    type: a.string().default("Post"),
    status: a.ref("PostStatus").required(),
    postType: a.ref("PostTypes").required(),
    postId: a.id().required(),
    content: a.string(),
    title: a.string(),
    authorId: a.string(),
    author: a.belongsTo("User", "authorId"),
    ownerEntityId: a.string().required(),
    ownerEntity: a.belongsTo("Entity", "ownerEntityId"),
    createdAt: a.datetime(),
    creators: a.string().array(),
    hide: a.string().authorization((allow) => [
      allow.ownersDefinedIn("creators").to(["update", "read"]),
      allow.ownerDefinedIn("authorId").to(["delete", "update", "read"])
    ]),
    medias: a.hasMany("Media", "postId")
  })
    .identifier(["postId"])
    .secondaryIndexes(index => [
      index("ownerEntityId"),
      index("authorId").queryField("listByAuthorId"),
      index("type").sortKeys(["createdAt"]).queryField("postsByDate"),
    ])
    .authorization((allow) => [
      allow.guest().to(["read"]),
      allow.authenticated("identityPool").to(["read"]),
      allow.authenticated("userPools").to(["create", "read"]),
      allow.ownersDefinedIn("creators").to(["delete", "update", "read"]),
      allow.ownerDefinedIn("authorId").to(["delete", "update", "read"])
    ]),
  EntityRquest: a.model({
    entityReqId: a.id().required(),
    type: a.ref("EntityTypes").required(),
    industry: a.string().required(),
    name: a.string().required(),
    username: a.string(),
    ownerId: a.string().required(),
    status: a.ref("EntityRequestStatus").authorization((allow) => [
      allow.authenticated("userPools").to(["create"]),
      allow.ownerDefinedIn("ownerId").to(["create", "read"]),
      allow.group("admin").to(["update", "read"])
    ]),
    entityRequestData: a.string().required(),
    owner: a.belongsTo("User", "ownerId")
  })
    .identifier(["entityReqId"])
    .secondaryIndexes(index => [
      index("ownerId").queryField("getEntityRequestsByOwnerId"),
    ])
    .authorization((allow) => [
      allow.authenticated("userPools").to(["create"]), // loged in user
      allow.ownerDefinedIn("ownerId").to(["read"]), // owner user
      allow.group("admin").to(["update", "read"]) // admin grup
    ]),
  Entity: a.model({
    entityId: a.id().required(),
    type: a.ref("EntityTypes").required(),
    name: a.string().required(),
    posts: a.hasMany("Post", "ownerEntityId"), // user id/sub that created the post
    ownerId: a.string().required(),
    owner: a.belongsTo("User", "ownerId")
  })
    .identifier(["entityId"])
    .secondaryIndexes(index => [
      index("ownerId").queryField("listEntitiesByOwnerId")
    ])
    .authorization((allow) => [
      allow.guest().to(["read"]),
      allow.authenticated("identityPool").to(["read"]),
      allow.authenticated("userPools").to(["read"]),
      allow.ownerDefinedIn("ownerId").to(["update", "read"])
    ]),
  Media: a.model({
    type: a.string().default("Media"),
    mediaId: a.id().required(),
    fileName: a.string().required(),
    contentType: a.ref("MediaContentTypes"),
    path: a.string(),
    createdAt: a.datetime(),
    ownerId: a.string(),
    owner: a.belongsTo("User", "ownerId"),
    postId: a.id(),
    post: a.belongsTo("Post", "postId")
  })
    .identifier(["mediaId"])
    .secondaryIndexes(index => [
      index("type").sortKeys(["createdAt"]).queryField("listMediaByDate"),
      index("ownerId").sortKeys(["createdAt"]).queryField("listMediaByOwner"),
      index("postId").sortKeys(["createdAt"]).queryField("listMediaByPost")
    ])
    .authorization((allow) => [
      allow.guest().to(["read"]),
      allow.authenticated("userPools").to(["create", "read"]),
      allow.ownerDefinedIn("ownerId").to(["delete", "update", "read"])
    ]),
  AppData: a.model({
    id: a.string().required(),
    registeredUsersCount: a.integer().default(0)
  })
    .identifier(['id'])
    .authorization(allow => [allow.group("admin")])
})
  .authorization(
    (allow) => [
      allow.resource(postConfirmation).to(['mutate', 'query']),
      allow.resource(entityRequestStreams).to(['mutate']),
      allow.resource(schedulerMining).to(['mutate', 'query']),
      allow.resource(distributeTokens).to(['mutate', 'query']),
      allow.resource(getReferralStats).to(['query']),
      allow.resource(seed).to(['mutate'])
    ]
  );

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "iam",
  },
});
