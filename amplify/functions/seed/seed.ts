import { faker } from '@faker-js/faker';
import { type Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { env } from "$amplify/env/seed";

import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';


const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

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


        const res = await client.models.User.create(
          {
            userId: `seed-user-${index}-${Date.now()}`,
            email: faker.internet.email({ firstName, lastName }),
            firstName,
            lastName,
            sub: `seed-sub-${index}-${Date.now()}`,
            owner: `seed-user-${index}-${Date.now()}`
          }
        )

        console.log(res.data)

        return res.data;
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

          const res = await client.models.Entity.create(
            {
              entityId: `seed-entity-${user!.userId}-${index}-${Date.now()}`,
              type,
              name,
              ownerId: user!.userId
            }
          )
          return res.data;
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


          const res = await client.models.Post.create(
            {
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
          )
          return res.data;
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

          const res = await client.models.Media.create(
            {
              mediaId: `seed-media-${post!.postId}-${index}-${Date.now()}`,
              fileName,
              contentType,
              path: faker.helpers.fake(`media/content/${faker.number.int({ max: 10 })}`),
              ownerId: post!.authorId,
              postId: post!.postId,
              createdAt: post!.createdAt
            }
          )

          return res.data;
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
