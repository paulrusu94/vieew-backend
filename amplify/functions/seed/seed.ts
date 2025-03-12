import { faker } from '@faker-js/faker';
import { type Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { env } from "$amplify/env/seed";

export const createUserQuery = /* GraphQL */ `
  mutation CreateUser(
    $condition: ModelUserConditionInput
    $input: CreateUserInput!
  ) {
    createUser(condition: $condition, input: $input) {
      createdAt
      email
      entities {
        nextToken
        __typename
      }
      entityRequests {
        nextToken
        __typename
      }
      firstName
      hide
      lastName
      medias {
        nextToken
        __typename
      }
      owner
      posts {
        nextToken
        __typename
      }
      sub
      updatedAt
      userId
      __typename
    }
  }
`;
export const createPost = /* GraphQL */ `
  mutation CreatePost(
    $condition: ModelPostConditionInput
    $input: CreatePostInput!
  ) {
    createPost(condition: $condition, input: $input) {
      author {
        createdAt
        email
        firstName
        hide
        lastName
        owner
        sub
        updatedAt
        userId
        __typename
      }
      authorId
      content
      createdAt
      creators
      hide
      medias {
        nextToken
        __typename
      }
      ownerEntity {
        createdAt
        entityId
        name
        ownerId
        type
        updatedAt
        __typename
      }
      ownerEntityId
      postId
      postType
      status
      title
      type
      updatedAt
      __typename
    }
  }
`;
export const createMedia = /* GraphQL */ `
  mutation CreateMedia(
    $condition: ModelMediaConditionInput
    $input: CreateMediaInput!
  ) {
    createMedia(condition: $condition, input: $input) {
      contentType
      createdAt
      fileName
      mediaId
      owner {
        createdAt
        email
        firstName
        hide
        lastName
        owner
        sub
        updatedAt
        userId
        __typename
      }
      ownerId
      path
      post {
        authorId
        content
        createdAt
        creators
        hide
        ownerEntityId
        postId
        postType
        status
        title
        type
        updatedAt
        __typename
      }
      postId
      type
      updatedAt
      __typename
    }
  }
`;
export const createEntity = /* GraphQL */ `
  mutation CreateEntity(
    $condition: ModelEntityConditionInput
    $input: CreateEntityInput!
  ) {
    createEntity(condition: $condition, input: $input) {
      createdAt
      entityId
      name
      owner {
        createdAt
        email
        firstName
        hide
        lastName
        owner
        sub
        updatedAt
        userId
        __typename
      }
      ownerId
      posts {
        nextToken
        __typename
      }
      type
      updatedAt
      __typename
    }
  }
`;

Amplify.configure(
  {
    API: {
      GraphQL: {
        endpoint: env.AMPLIFY_DATA_GRAPHQL_ENDPOINT,
        region: env.AWS_REGION,
        defaultAuthMode: "iam",
      },
    },
  },
  {
    Auth: {
      credentialsProvider: {
        getCredentialsAndIdentityId: async () => ({
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN,
          },
        }),
        clearCredentialsAndIdentityId: () => {
          /* noop */
        },
      },
    },
  }
);

interface SeedingParams {
  userCount?: number;
  postsPerEntity?: number;
  mediasPerPost?: number;
  entityTypes?: ("VIEEWER" | "ADS" | "AGENCY")[];
  postTypes?: ("TEXT" | "MEDIA_PHOTO" | "MEDIA")[];
  postStatus?: ("IN_DRAFT" | "IN_REVIEW" | "IN_ARCHIVE" | "IN_FEED")[];
  mediaTypes?: ("image_png" | "image_jpg" | "video_mp4")[];
  entitiesPerSelectedUser?: number;
  entitiesRatio?: number;
}

async function generateRealisticPost(): Promise<string> {
  const postTypes = [
    () => faker.lorem.paragraph(3), // Normal text post
    () => faker.lorem.sentences(2), // Short update
    () => `${faker.lorem.sentence()}\n\n${faker.lorem.paragraphs(2)}`, // Structured post
    () => faker.helpers.fake(
      '{{lorem.sentence}}\n\n🎉 {{lorem.sentence}}\n\n{{lorem.paragraph}}'
    ), // Post with emoji
    () => faker.helpers.fake(
      '#{{word.noun}} #{{word.adjective}}\n\n{{lorem.paragraph}}'
    ) // Post with hashtags
  ];

  return faker.helpers.arrayElement(postTypes)();
}

export async function seedDatabase(params: SeedingParams = {}): Promise<any> {
  const client = generateClient<Schema>({
    authMode: "iam",
  });
      
  const {
    userCount = 100,
    postsPerEntity = 5,
    mediasPerPost = 1,
    entityTypes = ["VIEEWER", "ADS", "AGENCY"],
    postTypes = ["TEXT", "MEDIA_PHOTO", "MEDIA"],
    postStatus = ["IN_FEED", "IN_DRAFT", "IN_REVIEW", "IN_ARCHIVE"],
    mediaTypes = ["image_jpg", "image_png", "video_mp4"],
    entitiesPerSelectedUser = 2,
    entitiesRatio = 0.1
  } = params;

  const usersWithEntitiesCount = Math.max(1, Math.floor(userCount * entitiesRatio));

  const getRandomItem = <T>(array: T[]): T => {
    return array[Math.floor(Math.random() * array.length)];
  };

  try {
    // Create users with realistic data
    const users = await Promise.all(
      Array(userCount).fill(null).map(async (_, index) => {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();

        
        const data = await client.graphql<Schema['User']['type']>({
          query: createUserQuery,
          variables: {
            input:{
              userId: `seed-user-${index}-${Date.now()}`,
              email: faker.internet.email({ firstName, lastName }),
              firstName,
              lastName,
              sub: `seed-sub-${index}-${Date.now()}`,
              owner: `seed-user-${index}-${Date.now()}`
            }
          }
        }) as any

        console.log(data.data!.createUser)

        return data.data.createUser;
      })
    )
      

    // Randomly select 10% of users
    const selectedUsers = users
      .sort(() => Math.random() - 0.5)
      .slice(0, usersWithEntitiesCount);


      console.log(selectedUsers)

    // Create entities with realistic names
    const entities = await Promise.all(
      selectedUsers.flatMap(user => 
        Array(entitiesPerSelectedUser).fill(null).map(async (_, index) => {
          const type = getRandomItem(entityTypes);
          let name: string;

          switch (type) {
            case 'AGENCY':
              name = `${faker.company.name()} Agency`;
              break;
            case 'ADS':
              name = `${faker.company.name()} Advertising`;
              break;
            default: // VIEEWER
              name = `${faker.person.firstName()}'s Channel`;
          }

          const data = await client.graphql<Schema['Entity']['type']>({
            query: createEntity,
            variables: {
              input:{
                entityId: `seed-entity-${user!.userId}-${index}-${Date.now()}`,
                type,
                name,
                ownerId: user!.userId
              }
            }
          }) as any

          return data.data.createEntity;
        })
      )
    );

    // Create posts with realistic content
    const posts = await Promise.all(
      entities.flatMap(entity =>
        Array(postsPerEntity).fill(null).map(async (_, index) => {
          const postType = getRandomItem(postTypes);
          const createdAt = faker.date.past({ years: 1 }).toISOString();
          
          // Generate realistic title based on post type
          const title = postType === 'TEXT' 
            ? faker.lorem.sentence({ min: 3, max: 8 })
            : faker.helpers.arrayElement([
                'Check this out! 📸',
                'New content alert 🎉',
                'Just uploaded 🚀',
                faker.lorem.sentence({ min: 2, max: 5 })
              ]);


              const data = await client.graphql<Schema['Post']['type']>({
                query: createPost,
                variables: {
                  input:{
                    postId: `seed-post-${entity!.entityId}-${index}-${Date.now()}`,
                    type: "Post",
                    status: getRandomItem(postStatus),
                    postType,
                    content: await generateRealisticPost(),
                    title,
                    authorId: entity!.ownerId,
                    ownerEntityId: entity!.entityId,
                    creators: [entity!.ownerId],
                    createdAt,
                  }
                }
              }) as any
  
            return data.data.createPost;
          })
        )
      );

    // Create media with realistic names and paths
    const medias = await Promise.all(
      posts.flatMap(post =>
        Array(mediasPerPost).fill(null).map(async (_, index) => {
          const contentType = getRandomItem(mediaTypes);
          const extension = contentType.split('_')[1];
          
          // Generate realistic file names
          const fileName = faker.helpers.arrayElement([
            `${faker.word.sample()}_${faker.number.int({ min: 1000, max: 9999 })}.${extension}`,
            `IMG_${faker.number.int({ min: 1000, max: 9999 })}.${extension}`,
            `photo_${faker.date.recent().getTime()}.${extension}`,
            `${faker.word.adjective()}_${faker.word.noun()}.${extension}`
          ]);

          const data = await client.graphql<Schema['Media']['type']>({
            query: createMedia,
            variables: {
              input:{
                mediaId: `seed-media-${post!.postId}-${index}-${Date.now()}`,
                fileName,
                contentType,
                path: faker.helpers.fake(`media/content/${faker.number.int({max: 10})}`),
                ownerId: post!.authorId,
                postId: post!.postId,
                createdAt: post!.createdAt
              }
            }
          }) as any

        return data.data.createMedia;
        })
      )
    );

    return {
      users: users.length,
      // entities: entities.length,
      // posts: posts.length,
      // medias: medias.length,
      usersWithEntities: selectedUsers.length
    };
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}
