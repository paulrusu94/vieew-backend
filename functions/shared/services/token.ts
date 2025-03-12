export class TokenService {
    static getDailyRate(totalUsers: number): number {
        if (totalUsers <= 1000) return 1000;
        if (totalUsers <= 5000) return 500;
        if (totalUsers <= 10000) return 100;
        return 50;
    }

    static getReferralLevelPercent(invitedUsers: number): number {
        if (invitedUsers <= 10) return 25;
        if (invitedUsers <= 25) return 50;
        if (invitedUsers <= 50) return 75;
        return 100;
    }
}