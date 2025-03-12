// shared/utils/date.ts
export class DateUtils {
    static formatDateISO(date: Date | string): string {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            throw new Error(`Invalid date format: ${date}`);
        }
        return d.toISOString();
    }

    static isDateBetween(
        date: string, 
        startDate: string, 
        endDate: string
    ): boolean {
        const d = new Date(date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return d >= start && d <= end;
    }
}