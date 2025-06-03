export class Ride {
    id: number;
    busId: number;
    routeId: number;
    startTime: Date;
    endTime: Date | null;
    status: RideStatus;

    constructor(id: number, busId: number, routeId: number, startTime: Date = new Date()) {
        this.id = id;
        this.busId = busId;
        this.routeId = routeId;
        this.startTime = startTime;
        this.endTime = null;
        this.status = RideStatus.Scheduled;
    }

    // Start the ride
    start(): void {
        this.startTime = new Date();
        this.status = RideStatus.InProgress;
    }

    // Complete the ride
    complete(): void {
        this.endTime = new Date();
        this.status = RideStatus.Completed;
    }

    // Cancel the ride
    cancel(reason: string = ""): void {
        this.endTime = new Date();
        this.status = RideStatus.Cancelled;
    }

    // Get ride duration in minutes (if completed)
    getDurationMinutes(): number | null {
        if (!this.endTime) return null;
        
        const durationMs = this.endTime.getTime() - this.startTime.getTime();
        return Math.round(durationMs / 60000); // Convert ms to minutes
    }

    // Create a Ride from a plain object
    static fromObject(obj: any): Ride {
        const ride = new Ride(
            obj.id,
            obj.busId,
            obj.routeId,
            obj.startTime ? new Date(obj.startTime) : new Date()
        );
        
        if (obj.endTime) {
            ride.endTime = new Date(obj.endTime);
        }
        
        if (obj.status) {
            ride.status = obj.status;
        }
        
        return ride;
    }
}

// Enum for ride status
export enum RideStatus {
    Scheduled = "scheduled",
    InProgress = "in_progress",
    Completed = "completed",
    Cancelled = "cancelled"
}