<script lang="ts">
  import { Route } from '$lib/Route';
  import { Section } from '$lib/Section';
  import { Coordinate } from '$lib/Coordinate';
  import { MapLibre, Marker, LineLayer, RawSource } from 'svelte-maplibre-gl';
  import { onMount } from 'svelte';
  import { Stop } from '$lib/Stop';

  // Add a persistent collection of all sections across routes
  let allSections: Section[] = [];
  let nextSectionId = 1; // Start section IDs from 1

  let fileInput: HTMLInputElement;
  let fileContent: string | null = null;
  let fileName: string = '';
  let error: string = '';
  let success: string = '';
  let parsedRoute: Route | null = null;
  let routeGeoJSON: any = null;
  let processingFile = false;
  let allStops: Stop[] = [];
  let routeSections: Section[] = [];

  // Default map center (Ljubljana, Slovenia)
  let mapCenter = { lng: 14.505751, lat: 46.056946 };
  let zoom = 12;

  /**
   * Parse GPX content and extract route information
   */
  function parseGPX(content: string): Route | null {
    try {
      // Parse XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, "text/xml");
      
      // Check if XML is valid
      if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("Invalid XML format");
      }
      
      // Get route name
      const routeElements = xmlDoc.getElementsByTagName("rte");
      if (routeElements.length === 0) {
        throw new Error("No route found in GPX file");
      }
      
      const routeElement = routeElements[0];
      const nameElements = routeElement.getElementsByTagName("name");
      const routeName = nameElements.length > 0 ? nameElements[0].textContent || fileName : fileName;
      
      // Extract route points
      const routePoints = routeElement.getElementsByTagName("rtept");
      const coordinates: Coordinate[] = [];
      const stops: Stop[] = [];
      const stopIndices: number[] = []; // Track indices in the coordinates array where stops are located
      
      // Process all points and identify stops
      for (let i = 0; i < routePoints.length; i++) {
        const point = routePoints[i];
        const lat = parseFloat(point.getAttribute("lat") || "0");
        const lon = parseFloat(point.getAttribute("lon") || "0");
        
        if (!isNaN(lat) && !isNaN(lon)) {
          const coordinate = new Coordinate(lon, lat);
          coordinates.push(coordinate);
          
          // Check if this is a stop (has a name)
          const nameElements = point.getElementsByTagName("name");
          if (nameElements.length > 0) {
            // check if stop already exists
            const stopName = nameElements[0].textContent || `Stop ${i + 1}`;
            const existingStop = allStops.find(stop => stop.name === stopName);
            
            let stop: Stop;
            if (existingStop) {
              stop = existingStop;
            } else {
              // Create a new stop
              stop = new Stop(
                allStops.length + 1, 
                stopName, 
                coordinate
              );
              allStops.push(stop);
            }
            
            stops.push(stop);
            stopIndices.push(coordinates.length - 1); // Current index is a stop
          }
        }
      }
      
      // Clear sections for this route
      routeSections = [];
      
      // Create sections between stops
      const sectionIds: number[] = [];
      
      for (let i = 0; i < stops.length - 1; i++) {
        const startStopId = stops[i].id;
        const endStopId = stops[i + 1].id;
        
        // Check if a section with the same start and end stops already exists
        let existingSection = allSections.find(
          section => section.startStopId === startStopId && section.endStopId === endStopId
        );
        
        if (existingSection) {
          // Reuse existing section
          console.log(`Reusing existing section ${existingSection.id} from ${getStopName(startStopId)} to ${getStopName(endStopId)}`);
          sectionIds.push(existingSection.id);
          routeSections.push(existingSection);
        } else {
          // Get coordinates between these stops
          const startIdx = stopIndices[i];
          const endIdx = stopIndices[i + 1];
          const sectionPath = coordinates.slice(startIdx, endIdx + 1);
          
          // Create a new section with sequential ID
          const section = new Section(
            nextSectionId++, // Use and increment the next available ID
            startStopId,
            endStopId,
            sectionPath
          );
          
          // Add to both route sections and all sections collections
          routeSections.push(section);
          allSections.push(section);
          sectionIds.push(section.id);
          
          console.log(`Created new section ${section.id} from ${getStopName(startStopId)} to ${getStopName(endStopId)}`);
        }
      }
      
      // Create a new route based on sections
      const route = new Route(
        Date.now(),
        routeName,
        sectionIds,
        stops.map(stop => stop.id)
      );
      
      return route;
    } catch (err) {
      console.error("Error parsing GPX:", err);
      error = err instanceof Error ? err.message : "Unknown error parsing GPX file";
      return null;
    }
  }

  /**
   * Handle file upload
   */
  async function handleFileUpload(event: Event) {
    error = '';
    success = '';
    parsedRoute = null;
    routeGeoJSON = null;
    processingFile = true;
    
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    
    if (!file) {
      error = "No file selected";
      processingFile = false;
      return;
    }
    
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      error = "Please upload a GPX file";
      processingFile = false;
      return;
    }
    
    fileName = file.name;
    
    try {
      // Read file content
      fileContent = await file.text();
      
      // Parse GPX
      parsedRoute = parseGPX(fileContent);
      
      if (parsedRoute) {
        // For display purposes we need coordinates - we'll recreate GeoJSON
        const allCoordinates = routeSections.flatMap(section => section.path);
        routeGeoJSON = {
          type: "Feature",
          properties: {
            id: parsedRoute.id,
            name: parsedRoute.name
          },
          geometry: {
            type: "LineString",
            coordinates: allCoordinates.map(coord => [coord.lng, coord.lat])
          }
        };
        
        // Center map on first coordinate if available
        if (allCoordinates.length > 0) {
          mapCenter = { 
            lng: allCoordinates[0].lng, 
            lat: allCoordinates[0].lat 
          };
        }
        
        success = `Successfully parsed route: ${parsedRoute.name} with ${routeSections.length} sections`;
      }
    } catch (err) {
      console.error("Error reading file:", err);
      error = err instanceof Error ? err.message : "Unknown error reading file";
    } finally {
      processingFile = false;
    }
  }

  /**
   * Save the route to your system
   */
  async function saveRoute() {
    if (!parsedRoute) {
      error = "No valid route to save";
      return;
    }
    
    try {
      // In a real application, you would save this to a database or API
      // For now, we'll just show a success message
      console.log("Saving route:", parsedRoute);
      console.log("Route sections:", routeSections);
      console.log("All sections in system:", allSections);
      
      // Log details about each section
      routeSections.forEach((section, index) => {
        const startStop = allStops.find(stop => stop.id === section.startStopId);
        const endStop = allStops.find(stop => stop.id === section.endStopId);
        
        console.log(`Section ${section.id}: 
          From: ${startStop?.name} (ID: ${section.startStopId})
          To: ${endStop?.name} (ID: ${section.endStopId})
          Length: ${section.length.toFixed(2)} meters
          Points: ${section.path.length}
        `);
      });
      
      console.log("All stops:", allStops);
      
      success = `Route "${parsedRoute.name}" with ${routeSections.length} sections saved successfully!`;
    } catch (err) {
      console.error("Error saving route:", err);
      error = err instanceof Error ? err.message : "Unknown error saving route";
    }
  }

  // Helper function to get stop name from ID
  function getStopName(stopId: number): string {
    const stop = allStops.find(s => s.id === stopId);
    return stop?.name || `Stop ${stopId}`;
  }
</script>

<div class="container">
  <h1>Add New Route</h1>
  
  <div class="upload-section">
    <label for="gpx-file" class="file-label">
      <span class="upload-icon">📁</span>
      Upload GPX File
    </label>
    <input 
      type="file" 
      id="gpx-file" 
      accept=".gpx" 
      on:change={handleFileUpload} 
      bind:this={fileInput}
      disabled={processingFile}
    />
    
    {#if processingFile}
      <div class="processing">Processing file...</div>
    {/if}
    
    {#if error}
      <div class="error-message">{error}</div>
    {/if}
    
    {#if success}
      <div class="success-message">{success}</div>
    {/if}
    
    {#if parsedRoute}
      <div class="route-details">
        <h2>Route Details</h2>
        <p><strong>Name:</strong> {parsedRoute.name}</p>
        <p><strong>Sections:</strong> {routeSections.length}</p>
        <p><strong>Stops:</strong> {parsedRoute.stops.length}</p>

        {#if routeSections.length > 0}
          <div class="sections-summary">
            <h3>Sections</h3>
            <ul class="section-list">
              {#each routeSections as section, i}
                <li>
                  <strong>Section {i+1}:</strong> {getStopName(section.startStopId)} → {getStopName(section.endStopId)} 
                  <span class="section-details">({section.path.length} points, {section.length.toFixed(0)}m)</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        
        <button on:click={saveRoute} class="save-btn">Save Route</button>
      </div>
    {/if}
  </div>
  
  {#if routeGeoJSON}
    <div class="map-container">
      <h2>Route Preview</h2>
      <MapLibre
        class="map-libre"
        style="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        bind:zoom
        center={mapCenter}
      >
        <RawSource type="geojson" data={routeGeoJSON}>
          <LineLayer
            id="route-path"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': '#3388ff', 'line-width': 4 }}
          />
        </RawSource>
        
        <!-- Display markers for stops -->
        {#each parsedRoute?.stops || [] as stopId}
          {#if allStops.find(stop => stop.id === stopId)}
            {@const stop = allStops.find(s => s.id === stopId)}
            <Marker
              lnglat={stop?.getCoordinates() || { lng: 0, lat: 0 }}
            >
              {#snippet content()}
                <div class="stop-marker">
                  <div class="stop-icon">🚩</div>
                  <div class="stop-label">{stop?.name || `Stop ${stopId}`}</div>
                </div>
              {/snippet}
            </Marker>
          {/if}
        {/each}
      </MapLibre>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }
  
  h1 {
    color: #333;
    margin-bottom: 20px;
  }
  
  .upload-section {
    margin-bottom: 30px;
    padding: 20px;
    background: #f5f5f5;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .file-label {
    display: inline-block;
    padding: 10px 20px;
    background: #4285f4;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.3s ease;
  }
  
  .file-label:hover {
    background: #3367d6;
  }
  
  .upload-icon {
    margin-right: 8px;
  }
  
  input[type="file"] {
    display: none;
  }
  
  .error-message {
    color: #e53935;
    margin-top: 10px;
    padding: 10px;
    background: rgba(229, 57, 53, 0.1);
    border-left: 3px solid #e53935;
  }
  
  .success-message {
    color: #43a047;
    margin-top: 10px;
    padding: 10px;
    background: rgba(67, 160, 71, 0.1);
    border-left: 3px solid #43a047;
  }
  
  .processing {
    margin-top: 10px;
    color: #555;
    font-style: italic;
  }
  
  .route-details {
    margin-top: 20px;
    padding: 15px;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .save-btn {
    margin-top: 15px;
    padding: 8px 16px;
    background: #43a047;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.3s ease;
  }
  
  .save-btn:hover {
    background: #388e3c;
  }
  
  .map-container {
    margin-top: 20px;
  }
  
  :global(.map-libre) {
    height: 500px !important;
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
  }

  .sections-summary {
    margin-top: 15px;
    padding: 10px;
    background-color: #f9f9f9;
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .section-list {
    margin: 0;
    padding-left: 20px;
  }
  
  .section-list li {
    margin-bottom: 5px;
  }
  
  .section-details {
    font-size: 0.85em;
    color: #666;
  }
  
  .stop-marker {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .stop-icon {
    font-size: 20px;
  }
  
  .stop-label {
    background-color: #2c3e50;
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
  }
</style>