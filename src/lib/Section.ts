import { Coordinate } from './Coordinate';

/**
 * Represents a section of a route between two stops.
 */
export class Section {
    id: number;
    startStopId: number;
    endStopId: number;
    length: number;
    path: Coordinate[];

    /**
     * Creates a new Section instance.
     * @param id Unique identifier for this section
     * @param startStopId ID of the starting stop
     * @param endStopId ID of the ending stop
     * @param path List of coordinates defining the physical path
     * @param length Optional length in meters (calculated from path if not provided)
     */
    constructor(id: number, startStopId: number, endStopId: number, path: Coordinate[], length?: number) {
        this.id = id;
        this.startStopId = startStopId;
        this.endStopId = endStopId;
        this.path = path;
        this.length = length ?? this.calculateLength();
    }

    /**
     * Calculate the length of the section based on its path coordinates.
     * @returns Total length in meters
     */
    private calculateLength(): number {
        let totalLength = 0;
        
        // Need at least two points to calculate distance
        if (this.path.length < 2) return 0;
        
        for (let i = 0; i < this.path.length - 1; i++) {
            totalLength += this.calculateDistanceBetweenCoordinates(
                this.path[i],
                this.path[i + 1]
            );
        }
        
        return totalLength;
    }
    
    /**
     * Calculate distance between two coordinates using the Haversine formula.
     * @param coord1 First coordinate
     * @param coord2 Second coordinate
     * @returns Distance in meters
     */
    private calculateDistanceBetweenCoordinates(coord1: Coordinate, coord2: Coordinate): number {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = coord1.lat * Math.PI / 180;
        const φ2 = coord2.lat * Math.PI / 180;
        const Δφ = (coord2.lat - coord1.lat) * Math.PI / 180;
        const Δλ = (coord2.lng - coord1.lng) * Math.PI / 180;
        
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c; // Distance in meters
    }
    
    /**
     * Get section as GeoJSON LineString feature.
     * @returns GeoJSON feature for mapping
     */
    toGeoJSON() {
        return {
            type: 'Feature',
            properties: {
                id: this.id,
                startStopId: this.startStopId,
                endStopId: this.endStopId,
                length: this.length
            },
            geometry: {
                type: 'LineString',
                coordinates: this.path.map(coord => [coord.lng, coord.lat])
            }
        };
    }
    
    /**
     * Create a Section instance from a plain object.
     * @param obj Object with section data
     * @returns New Section instance
     */
    static fromObject(obj: any): Section {
        const path = obj.path.map((p: any) => 
            new Coordinate(p.lng, p.lat));
            
        return new Section(
            obj.id,
            obj.startStopId,
            obj.endStopId,
            path,
            obj.length
        );
    }
}