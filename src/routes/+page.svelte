<script lang="ts">
  import { MapLibre, NavigationControl, ScaleControl, GeolocateControl, Marker, LineLayer, RawSource, Popup } from 'svelte-maplibre-gl';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { RouteData, StopsData, BusData as ImportedBusData, RideData, SectionData } from '$lib/data';
  import type { Stop } from '$lib/Stop';
  import type { Bus } from '$lib/Bus';
  import { RideStatus } from '$lib/Ride';
  import type { Section } from '$lib/Section';
  import type { Coordinate } from '$lib/Coordinate';
  import type { Route } from '$lib/Route';
  import type { Ride } from '$lib/Ride';

  // Create a writable local copy of BusData
  let BusData = [...ImportedBusData];

  // Selected route tracking
  let selectedRouteId: number = RouteData[0]?.id || 0;
  let selectedRoute = RouteData[0];

  // Route search state
  let showRouteModal = false;
  let fromStop: Stop | null = null;
  let toStop: Stop | null = null;
  let activePopupStopId: number | null = null;

  // Route
  let lineGeoJSON: any = null;
  // search stop sections
  let searchPathGeoJSON: any = null;

  // Stops for the selected route
  let routeStops: Stop[] = []; 
  let showAllStops: boolean = false; // Toggle for showing all stops

  // Bus position tracking
  let busPositionIndices: Map<number, number> = new Map(); // Maps busId to position index on route
  let busMovementInterval: number;

  // Store active rides for curretn active routeas
  let activeRides: Ride[] = [];

  // Get buses associated with the active rides for this route
  $: routeBuses = activeRides
    .map(ride => BusData.find(bus => bus.id === ride.busId))
    .filter(Boolean) as Bus[];

  // Get all coordinates for a route by combining section paths
  function getRouteCoordinates(route: Route): Coordinate[] {
    if (!route || !route.sections) return [];
    
    const allCoordinates: Coordinate[] = [];
    
    for (const sectionId of route.sections) {
      const section = SectionData.find(s => s.id === sectionId);
      if (section && section.path) {
        // If this isn't the first section, avoid duplicating the connecting point
        if (allCoordinates.length > 0 && section.path.length > 0) {
          // Add all coordinates except the first one (which would be a duplicate)
          allCoordinates.push(...section.path.slice(1));
        } else {
          allCoordinates.push(...section.path);
        }
      }
    }
    
    return allCoordinates;
  }

  // Functions to handle stop selection
  function selectFromStop(stop: Stop) {
    fromStop = stop;
    activePopupStopId = null;
    showRouteModal = true;
  }

  function selectToStop(stop: Stop) {
    toStop = stop;
    activePopupStopId = null;
    showRouteModal = true;
  }

  // Function to search for routes between selected stops
  function searchRoutes() {
    if (!fromStop || !toStop) {
      alert("Please select both origin and destination stops");
      return;
    }
    
    // Find routes that include both stops
    const routesWithBothStops = RouteData.filter(route => 
      route.stops.includes(fromStop!.id) && route.stops.includes(toStop!.id)
    );
    
    // Check if from stop comes before to stop in route sequence
    const validRoutes = routesWithBothStops.filter(route => {
      const fromIndex = route.stops.indexOf(fromStop!.id);
      const toIndex = route.stops.indexOf(toStop!.id);
      return fromIndex < toIndex; // Ensure from stop comes before to stop
    });
    
    // Get active rides on these routes
    const validRideIds = RideData.filter(ride => 
      validRoutes.some(route => route.id === ride.routeId) && 
      (ride.status === RideStatus.InProgress || ride.status === RideStatus.Scheduled)
    ).map(ride => ride.busId);
    
    // Reset previous path
    searchPathGeoJSON = null; 
    
    if (validRoutes.length > 0) {
      // Create a feature for each route
      const features = validRoutes.map(route => {
        // Get indices of the stops in this route
        const fromStopIndex = route.stops.indexOf(fromStop!.id);
        const toStopIndex = route.stops.indexOf(toStop!.id);
        
        // Get section IDs between these stops for this specific route
        const routeSectionIds: number[] = [];
        
        // For each consecutive pair of stops between fromStop and toStop
        for (let i = fromStopIndex; i < toStopIndex; i++) {
          const currentStopId = route.stops[i];
          const nextStopId = route.stops[i + 1];
          
          // Find the section that connects these two stops
          const sectionId = route.sections[i];
          
          // Verify this section connects the expected stops
          const section = SectionData.find(s => 
            s.id === sectionId && 
            s.startStopId === currentStopId && 
            s.endStopId === nextStopId
          );
          
          if (section) {
            routeSectionIds.push(section.id);
          }
        }
        
        // Get coordinates for this route's sections
        const pathCoordinates = getPathCoordinatesForSections(routeSectionIds);
        
        if (pathCoordinates.length > 0) {
          // Create a GeoJSON Feature for this route
          return {
            type: "Feature",
            properties: {
              routeId: route.id,
              routeName: route.name,
              from: fromStop!.name,
              to: toStop!.name,
              sectionCount: routeSectionIds.length
            },
            geometry: {
              type: "LineString",
              coordinates: pathCoordinates.map(coord => [coord.lng, coord.lat])
            }
          };
        }
        
        return null;
      }).filter(Boolean); // Remove any null features
      
      // Create a FeatureCollection containing all route features
      if (features.length > 0) {
        searchPathGeoJSON = {
          type: "FeatureCollection",
          properties: {
            name: `Routes from ${fromStop.name} to ${toStop.name}`,
            routeCount: features.length
          },
          features: features
        };
        
        console.log(`Created GeoJSON with ${features.length} separate route paths between stops`);
      }
    }

    // Prepare routes for display
    prepareRoutesForDisplay(validRoutes);
    
    // Close modal after search
    showRouteModal = false;
  }

  // Add this helper function after searchRoutes function
  function getPathCoordinatesForSections(sectionIds: number[]): Coordinate[] {
    const allCoordinates: Coordinate[] = [];
    
    for (const sectionId of sectionIds) {
      const section = SectionData.find(s => s.id === sectionId);
      if (section && section.path) {
        // If this isn't the first section, avoid duplicating the connecting point
        if (allCoordinates.length > 0 && section.path.length > 0) {
          // Add all coordinates except the first one (which would be a duplicate)
          allCoordinates.push(...section.path.slice(1));
        } else {
          allCoordinates.push(...section.path);
        }
      }
    }
    
    return allCoordinates;
  }

  // Function to find all buses passing through a specific stop
  function findBusesPassingThroughStop(stopId: number): Bus[] {
    // Find all routes that include this stop
    const routesWithStop = RouteData.filter(route => 
      route.stops.includes(stopId)
    );
    
    // Get the IDs of these routes
    const routeIds = routesWithStop.map(route => route.id);
    
    // Find active rides on these routes
    const ridesForRoutes = RideData.filter(ride => 
      routeIds.includes(ride.routeId) && 
      (ride.status === RideStatus.InProgress || ride.status === RideStatus.Scheduled)
    );
    
    // Get buses associated with these rides
    const buses = ridesForRoutes
      .map(ride => BusData.find(bus => bus.id === ride.busId))
      .filter(Boolean) as Bus[];
    
    return buses;
  }
  
  // Check if current position is near any stop (within threshold distance)
  function isNearStop(position: {lng: number, lat: number} | null, 
                     stops: Stop[] | null, 
                     thresholdMeters = 50) {
    if (!position || !stops || !stops.length) return false;
    
    // Very simple distance calculation
    return stops.some(stop => {
      // Calculate rough distance in meters
      const latDiff = stop.location.lat - position.lat;
      const lngDiff = stop.location.lng - position.lng;
      
      // Rough conversion to meters (varies by latitude)
      const metersPerLat = 111111; // 1 degree lat is approximately 111,111 meters
      const metersPerLng = Math.cos(position.lat * Math.PI / 180) * 111111;
      
      const distanceMeters = Math.sqrt(
        Math.pow(latDiff * metersPerLat, 2) + 
        Math.pow(lngDiff * metersPerLng, 2)
      );
      
      return distanceMeters <= thresholdMeters;
    });
  }

  function prepareRoutesForDisplay(routes: Route[]) {
    if (!routes || routes.length === 0) {
      lineGeoJSON = null;
      return;
    }
    
    // Create a feature for each route
    const features = routes.map(route => {
      // Get coordinates for this route
      const coordinates = getRouteCoordinates(route);
      
      if (coordinates.length === 0) return null;
      
      // Create a GeoJSON Feature for this route
      return {
        type: "Feature",
        properties: {
          id: route.id,
          name: route.name
        },
        geometry: {
          type: "LineString",
          coordinates: coordinates.map(coord => [coord.lng, coord.lat])
        }
      };
    }).filter(Boolean); // Remove any null features
    
    // Create a FeatureCollection containing all routes
    if (features.length > 0) {
      lineGeoJSON = {
        type: "FeatureCollection",
        properties: {
          name: "Route Display",
          routeCount: features.length
        },
        features: features
      };

      // update activeRides
      findActiveRidesForRoute(routes);

      // update routeStops
      findStopsForRoutes(routes);
    } else {
      lineGeoJSON = null;
    }
  }

  function findActiveRidesForRoute(routes: Route[]) {
    activeRides = RideData.filter(ride => 
      routes.some(route => route.id === ride.routeId) && 
      (ride.status === RideStatus.InProgress || ride.status === RideStatus.Scheduled)
    );
  }

  function findStopsForRoutes(routes: Route[]) {
    if (showAllStops) {
      // If showing all stops, use all stops data
      routeStops = StopsData;
    } else {
      //find unique stops for the selected routes
      routeStops = StopsData.filter(stop => 
        routes.some(route => route.stops.includes(stop.id))
      );
    }
  }

  // Function to handle route selection change
  function routeSelect() {
    selectedRoute = RouteData.find(route => route.id === selectedRouteId) || RouteData[0];
    prepareRoutesForDisplay([selectedRoute]);
    // Reset search path when route changes
    searchPathGeoJSON = null; 
    // Log only when the route selection actually changes
    console.log(`Selected route ${selectedRoute.name}`);
  }

  // Function to simulate bus movement along routes
  function simulateBusMovement() {
    // Clear any existing interval
    if (busMovementInterval) {
      clearInterval(busMovementInterval);
    }
    
    // Initialize position indices for all buses if not already set
    RideData.forEach(ride => {
      if (ride.status === RideStatus.InProgress || ride.status === RideStatus.Scheduled) {
        if (!busPositionIndices.has(ride.busId)) {
          // Get the route and its coordinates
          const route = RouteData.find(r => r.id === ride.routeId);
          if (route) {
            // Get all coordinates for this route
            const coordinates = getRouteCoordinates(route);
            if (coordinates.length > 0) {
              // Start at a random position on the route
              const randomIndex = Math.floor(Math.random() * coordinates.length);
              busPositionIndices.set(ride.busId, randomIndex);
            }
          }
        }
      }
    });
    
    // Set up interval to update bus positions every second
    busMovementInterval = window.setInterval(() => {
      let updated = false;
      
      // For each active ride, update the bus position
      RideData.forEach(ride => {
        if (ride.status === RideStatus.InProgress || ride.status === RideStatus.Scheduled) {
          const route = RouteData.find(r => r.id === ride.routeId);
          const bus = BusData.find(b => b.id === ride.busId);
          
          if (route && bus) {
            // Get all coordinates for this route
            const coordinates = getRouteCoordinates(route);
            
            if (coordinates.length > 0) {
              // Get current position index, defaulting to 0 if not set
              let posIndex = busPositionIndices.get(ride.busId) || 0;
              
              // Move to next position
              posIndex = (posIndex + 1) % coordinates.length;
              busPositionIndices.set(ride.busId, posIndex);
              
              // Update bus position
              bus.location.lng = coordinates[posIndex].lng;
              bus.location.lat = coordinates[posIndex].lat;
              updated = true;
              
              // // Check if at a stop
              // const isAtStop = route.stops.some(stopId => {
              //   // Find the stop in StopsData
              //   const stop = StopsData.find(s => s.id === stopId);
              //   if (stop) {
              //     // Check if bus is near this stop
              //     const busPos = { lng: bus.location.lng, lat: bus.location.lat };
              //     return isNearStop(busPos, [stop]);
              //   }
              //   return false;
              // });
              
              // if (isAtStop) {
              //   console.log(`Bus ${bus.plate} is at a stop`);
              // }
            }
          }
        }
      });
      
      // Force reactivity update if any bus positions were updated
      if (updated) {
        BusData = [...BusData];
      }
    }, 1000);
  }

  onMount(() => {
    // Start the bus movement simulation
    if (browser) {
      routeSelect();
      simulateBusMovement();
    }
  });
  
  onDestroy(() => {
    // This only runs in the browser
    if (!browser) return;

    // Clear the bus movement interval
    if (busMovementInterval) {
      clearInterval(busMovementInterval);
    }
  });
</script>

<!-- Move route selector above the map -->
<div class="app-container">
  <!-- Route selector - now above the map -->
  <div class="route-selector-container">
    <div class="route-selector-inner">
      <div class="selector-group">
        <select bind:value={selectedRouteId} on:change={() => routeSelect()}>
          {#each RouteData as route}
            <option value={route.id}>{route.name}</option>
          {/each}
        </select>
      </div>
      
      {#if routeBuses.length > 0}
        <div class="route-info">
          {routeBuses.length} bus{routeBuses.length !== 1 ? 'es' : ''} on this route
        </div>
      {/if}

      <div class="show-all-stops">
        <label class="checkbox-container">
          <input type="checkbox" bind:checked={showAllStops} on:change={() => {
            findStopsForRoutes([selectedRoute]);
          }} />
          <span class="checkmark"></span>
          Show all stops
        </label>
      </div>
    </div>
  </div>

<MapLibre
  class="h-[100vh]"
  style="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
  zoom={9.5}
  center={{ lng: 14.505751, lat: 46.056946 }}
>
  <GeolocateControl
    position="top-left"
    positionOptions={{ enableHighAccuracy: true }}
    trackUserLocation={true}
    showAccuracyCircle={true}
    ongeolocate={(ev) => console.log('Geolocate event:', ev)}
  />
  <NavigationControl />
  <ScaleControl />

  <!-- Stop markers -->
  {#each routeStops as stop (stop.id)}
    <Marker lnglat={{ lng: stop.location.lng, lat: stop.location.lat }}>
      {#snippet content()}
        <button on:click={() => activePopupStopId = activePopupStopId === stop.id ? null : stop.id}>
          <div class="text-center leading-none">
            <div class="text-2xl">🚏</div>
            <div class="text-black drop-shadow-xs">{stop.name}</div>
          </div>
        </button>
      {/snippet}
    </Marker>
    
    <!-- Stop popup -->
    {#if activePopupStopId === stop.id}
      <Popup
        lnglat={{ lng: stop.location.lng, lat: stop.location.lat }}
        offset={25}
        closeButton={true}
        closeOnClick={false}
        onclose={() => activePopupStopId = null}
      >
        <div class="stop-popup">
          <h3>{stop.name}</h3>
          <div class="popup-actions">
            <button class="btn from-btn" on:click={() => selectFromStop(stop)}>
              From Here
            </button>
            <button class="btn to-btn" on:click={() => selectToStop(stop)}>
              To Here
            </button>
          </div>
          <button 
            class="btn info-btn" 
            on:click={() => {
              const passingBuses = findBusesPassingThroughStop(stop.id);
              console.log(`Stop: ${stop.name} (ID: ${stop.id})`);
              console.log(`${passingBuses.length} buses passing through this stop:`, 
                passingBuses.map(bus => `${bus.plate} (ID: ${bus.id})`));
            }}
          >
            Show Buses
          </button>
        </div>
      </Popup>
    {/if}
  {/each}

  <!-- Bus markers for the selected route -->
  {#each routeBuses as bus (bus.id)}
    <Marker lnglat={{ lng: bus.location.lng, lat: bus.location.lat }}>
      {#snippet content()}
        <div class="text-center leading-none">
          <div class="text-3xl">🚌</div>
          <div class="font-bold text-black drop-shadow-xs">Bus {bus.plate}</div>
        </div>
      {/snippet}
    </Marker>
  {/each}

  <!-- Route line for the selected route -->
  {#if lineGeoJSON}
    <RawSource
      type="geojson"
      data={lineGeoJSON}
      maxzoom={13}
    >
      <LineLayer
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': 'red', 'line-width': 1.5 }}
        />
    </RawSource>
  {/if}

  <!-- search by stop sections -->
  {#if searchPathGeoJSON}
    <RawSource
      type="geojson"
      data={searchPathGeoJSON}
      maxzoom={13}
    >
      <LineLayer
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{ 'line-color': '#2ecc71', 'line-width': 4 }}
      />
    </RawSource>
  {/if}

</MapLibre>

</div>

<!-- Route search modal -->
{#if showRouteModal}
  <div class="modal-overlay">
    <div class="modal-container">
      <h3 class="modal-title">Find Routes Between Stops</h3>
      
      <div class="modal-content">
        <div class="form-group">
          <label for="fromStop">From Stop:</label>
          {#if !fromStop}
            <select id="fromStop" bind:value={fromStop} class="stop-select">
              <option value={null}>Select origin stop...</option>
              {#each StopsData.filter(s => s.id !== toStop?.id) as stop}
                <option value={stop}>{stop.name}</option>
              {/each}
            </select>
          {:else}
            <div class="selected-stop">
              {fromStop.name}
              <button class="clear-btn" on:click={() => fromStop = null}>Change</button>
            </div>
          {/if}
        </div>
        
        <div class="form-group">
          <label for="toStop">To Stop:</label>
          {#if !toStop}
            <select id="toStop" bind:value={toStop} class="stop-select">
              <option value={null}>Select destination stop...</option>
              {#each StopsData.filter(s => s.id !== fromStop?.id) as stop}
                <option value={stop}>{stop.name}</option>
              {/each}
            </select>
          {:else}
            <div class="selected-stop">
              {toStop.name}
              <button class="clear-btn" on:click={() => toStop = null}>Change</button>
            </div>
          {/if}
        </div>
        
        <div class="modal-actions">
          <button class="btn search-btn" on:click={searchRoutes} disabled={!fromStop || !toStop}>
            Search Routes
          </button>
          <button class="btn cancel-btn" on:click={() => showRouteModal = false}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}


<style>
  /* Global styles */
  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
    color: #333;
    margin: 0;
    padding: 0;
  }

  .route-selector-container {
    background-color: #f8f9fa;
    padding: 10px 20px;
    border-bottom: 1px solid #e0e0e0;
    z-index: 10;
  }
  
  .route-selector-inner {
    max-width: 1000px;
    margin: 0 auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 15px;
  }
  
  .selector-group {
    flex: 1;
    min-width: 200px;
  }
  
  .route-selector-inner select {
    width: 100%;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    background-color: white;
    font-size: 14px;
    appearance: none;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>');
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .route-info {
    font-size: 13px;
    color: #555;
    text-align: center;
    padding: 8px 12px;
    background-color: #f0f9ff;
    border-radius: 4px;
    white-space: nowrap;
    margin: 0;
  }

  .show-all-stops {
    margin: 0;
    display: flex;
    align-items: center;
    white-space: nowrap;
  }
  
  /* Media queries for responsiveness */
  @media (max-width: 768px) {
    .route-selector-inner {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    
    .selector-group,
    .route-info,
    .show-all-stops {
      width: 100%;
    }
    
    .show-all-stops {
      justify-content: flex-start;
    }
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
  }

  .route-info {
    margin-top: 8px;
    font-size: 13px;
    color: #555;
    text-align: center;
    padding: 4px 8px;
    background-color: #f0f9ff;
    border-radius: 4px;
  }

  /* Modal overlay */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-container {
    background-color: white;
    border-radius: 12px;
    overflow: hidden;
    width: 90%;
    max-width: 450px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-title {
    background-color: #3498db;
    color: white;
    margin: 0;
    padding: 16px 20px;
    font-size: 18px;
    font-weight: 600;
  }

  .modal-content {
    padding: 20px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #555;
  }

  .selected-stop {
    padding: 12px 15px;
    background-color: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stop-select {
    width: 100%;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #e0e0e0;
    font-size: 14px;
    background-color: #f8f9fa;
    appearance: none;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>');
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 16px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 10px;
  }

  .btn {
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .search-btn {
    background-color: #2ecc71;
    color: white;
  }

  .search-btn:hover {
    background-color: #27ae60;
  }

  .search-btn:disabled {
    background-color: #95a5a6;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .cancel-btn {
    background-color: #ecf0f1;
    color: #7f8c8d;
  }

  .cancel-btn:hover {
    background-color: #bdc3c7;
    color: #2c3e50;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #3498db;
    font-size: 13px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .clear-btn:hover {
    background-color: #e3f2fd;
    text-decoration: underline;
  }
  
  /* Stop popup styling */
  :global(.maplibregl-popup-content) {
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 3px 14px rgba(0, 0, 0, 0.15);
  }

  .stop-popup h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #2c3e50;
  }

  .popup-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .from-btn, .to-btn {
    flex: 1;
    padding: 8px;
    font-size: 13px;
  }

  .from-btn {
    background-color: #3498db;
    color: white;
  }

  .from-btn:hover {
    background-color: #2980b9;
  }

  .to-btn {
    background-color: #2ecc71;
    color: white;
  }

  .to-btn:hover {
    background-color: #27ae60;
  }

  .info-btn {
    width: 100%;
    background-color: #f8f9fa;
    color: #2c3e50;
    border: 1px solid #e0e0e0;
  }

  .info-btn:hover {
    background-color: #ecf0f1;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    
    .modal-container {
      width: 95%;
    }
    
    .popup-actions {
      flex-direction: column;
    }
  }
  
  .checkbox-container {
    display: flex;
    align-items: center;
    cursor: pointer;
    font-size: 14px;
    user-select: none;
    color: #444;
  }
  
  .checkbox-container input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }
  
  .checkmark {
    position: relative;
    display: inline-block;
    height: 18px;
    width: 18px;
    margin-right: 8px;
    background-color: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    transition: all 0.2s ease;
  }
  
  .checkbox-container:hover input ~ .checkmark {
    background-color: #f0f0f0;
    border-color: #bbb;
  }
  
  .checkbox-container input:checked ~ .checkmark {
    background-color: #3498db;
    border-color: #3498db;
  }
  
  .checkmark:after {
    content: "";
    position: absolute;
    display: none;
    left: 6px;
    top: 2px;
    width: 4px;
    height: 9px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  
  .checkbox-container input:checked ~ .checkmark:after {
    display: block;
  }
</style>