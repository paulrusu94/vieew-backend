import {Schema} from "../../../data/resource"
import {AppData, User} from "../types"
import {generateClient} from "aws-amplify/data"

export class DatabaseService {
    // private client: ReturnType<typeof generateClient>;

    // constructor(client: ReturnType<typeof generateClient>) {
    //     this.client = client
    // }

    // async getAppData(id: string): Promise<AppData | null> {
    //     const response = await this.client.models.AppData.get({ id });
    //     return response.data;
    // }

    // async getUser(userId: string): Promise<User | null> {
    //     const response = await this.client.models.User.get({ userId });
    //     return response.data;
    // }

    // ... other database methods
}
