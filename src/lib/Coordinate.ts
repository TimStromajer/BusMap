export class Coordinate {
  lng: number;
  lat: number;

  /**
   * Creates a new Coordinate instance
   * 
   * @param lng Longitude of the coordinate
   * @param lat Latitude of the coordinate
   */
  constructor(lng: number, lat: number) {
    this.lng = lng;
    this.lat = lat;
  }
}