import { Coordinate } from "./Coordinate";

export class Stop {
    id: number;
    name: string;
    location: Coordinate;

    constructor(id: number, name: string, location: Coordinate) {
        this.id = id;
        this.name = name;
        this.location = location;
    }

    // Helper method to get coordinates as a simple object
    getCoordinates(): { lng: number; lat: number } {
        return {
            lng: this.location.lng,
            lat: this.location.lat
        };
    }
}