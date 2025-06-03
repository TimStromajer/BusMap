import { Coordinate } from "./Coordinate";

/**
 * Route class that represents a path composed of sections with stops
 */
export class Route {
  id: number;
  name: string;
  sections: number[];  // Section IDs instead of coordinates
  stops: number[];     // Stop IDs remain the same

  /**
   * Creates a new Route instance
   * 
   * @param id Unique identifier for the route
   * @param name Descriptive name of the route
   * @param sections List of section IDs that compose this route
   * @param stops List of stop IDs along the route
   */
  constructor(
    id: number,
    name: string,
    sections: number[] = [],
    stops: number[] = []
  ) {
    this.id = id;
    this.name = name;
    this.sections = sections;
    this.stops = stops;
  }

  /**
   * Adds a section to the route
   * 
   * @param sectionId ID of the section to add
   * @returns The updated Route instance
   */
  addSection(sectionId: number): Route {
    this.sections.push(sectionId);
    return this;
  }

  /**
   * Adds a stop to the route
   * 
   * @param stopId ID of the stop to add
   * @returns The updated Route instance
   */
  addStop(stopId: number): Route {
    this.stops.push(stopId);
    return this;
  }

  /**
   * Gets all coordinates for this route by combining all section paths
   * Note: Requires access to the actual Section objects
   * 
   * @param sectionMap Map of section IDs to Section objects
   * @returns Array of coordinates representing the complete route
   */
  getCoordinates(sectionMap: Map<number, { path: Coordinate[] }>): Coordinate[] {
    const allCoordinates: Coordinate[] = [];
    
    for (const sectionId of this.sections) {
      const section = sectionMap.get(sectionId);
      if (section) {
        // If this isn't the first section, avoid duplicating the connecting point
        if (allCoordinates.length > 0 && section.path.length > 0) {
          allCoordinates.push(...section.path);
        } else {
          allCoordinates.push(...section.path);
        }
      }
    }
    
    return allCoordinates;
  }

  /**
   * Converts the route to a GeoJSON feature for mapping
   * Note: Requires access to the actual Section objects
   * 
   * @param sectionMap Map of section IDs to Section objects
   * @returns GeoJSON feature representing the route
   */
  toGeoJSON(sectionMap: Map<number, { path: Coordinate[] }>) {
    const coordinates = this.getCoordinates(sectionMap);
    
    return {
      type: "Feature",
      properties: {
        id: this.id,
        name: this.name,
        sections: this.sections,
        stops: this.stops
      },
      geometry: {
        type: "LineString",
        coordinates: coordinates.map(coord => [coord.lng, coord.lat])
      }
    };
  }

  /**
   * Creates a Route from a plain object
   * 
   * @param obj Object containing route data
   * @returns A new Route instance
   */
  static fromObject(obj: any): Route {
    return new Route(
      obj.id,
      obj.name,
      obj.sections || [],
      obj.stops || []
    );
  }
}