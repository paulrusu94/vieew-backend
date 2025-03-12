import { seedDatabase } from './seed';

export const handler = async (event: any) => {
  try {
    // Default seeding parameters
    const defaultParams = {
      userCount: 10, // Reduced number for testing
      postsPerEntity: 3,
      mediasPerPost: 1,
      entityTypes: ["VIEEWER", "ADS", "AGENCY"],
      postTypes: ["TEXT", "MEDIA_PHOTO", "MEDIA"],
      postStatus: ["IN_FEED", "IN_DRAFT", "IN_REVIEW", "IN_ARCHIVE"],
      mediaTypes: ["image_jpg", "image_png", "video_mp4"],
      entitiesPerSelectedUser: 2
    };

    // Merge any parameters passed in the event with defaults
    const seedingParams = {
      ...defaultParams,
      ...(event.body ? JSON.parse(event.body) : {})
    };

    // Execute seeding
    const result = await seedDatabase(seedingParams);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*"
      },
      body: JSON.stringify({
        message: "Database seeded successfully",
        stats: result
      })
    };

  } catch (error) {
    console.error('Error in seed handler:', error);
    
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*"
      },
      body: JSON.stringify({
        message: "Error seeding database",
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
