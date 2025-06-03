import { Coordinate } from "./Coordinate";

export class Bus {
    id: number;
    plate: string;
    location: Coordinate;

    constructor(id: number, plate: string, location: Coordinate) {
        this.id = id;
        this.plate = plate;
        this.location = location;
    }

    // Helper method to get coordinates as a simple object
    getCoordinates(): { lng: number; lat: number } {
        return {
            lng: this.location.lng,
            lat: this.location.lat
        };
    }

    // Update the bus location
    updateLocation(newLocation: Coordinate): void {
        this.location = newLocation;
    }
    
    // Helper method to update location with lng/lat values
    updatePosition(lng: number, lat: number): void {
        this.location = new Coordinate(lng, lat);
    }

    // Create a Bus from a plain object
    static fromObject(obj: any): Bus {
        return new Bus(
            obj.id,
            obj.plate,
            new Coordinate(obj.location.lng, obj.location.lat)
        );
    }
}