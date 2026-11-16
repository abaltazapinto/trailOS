import { Camera, GeoJSONSource, Layer, Map, NativeUserLocation } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { GpsTrackPoint } from '../domain/activity';
import { colors } from '../ui/theme';

/**
 * OpenFreeMap "dark": OpenStreetMap vector tiles with no API key or account.
 * This is the only place that names the tile provider.
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

const DEFAULT_ZOOM = 15;

interface RouteMapProps {
  /** Route to draw, in traversal order. Fewer than two points draws nothing. */
  track: readonly GpsTrackPoint[];
  /** Shows the device position puck. Requires granted location permission. */
  showUserLocation: boolean;
  /** Keeps the camera centred on the device position and disables panning. */
  followUser: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Dark outdoor map with an optional route line and the user's position. */
export default function RouteMap({ track, showUserLocation, followUser, style }: RouteMapProps) {
  const route = useMemo<GeoJSON.Feature<GeoJSON.LineString> | null>(() => (
    track.length < 2 ? null : {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: track.map((point) => [point.longitude, point.latitude]),
      },
    }
  ), [track]);

  return (
    <Map
      style={style}
      mapStyle={MAP_STYLE_URL}
      attribution
      logo={false}
      compass={false}
      scaleBar={false}
      tintColor={colors.accent}
      dragPan={!followUser}
      touchRotate={false}
      touchPitch={false}
    >
      <Camera
        initialViewState={{ zoom: DEFAULT_ZOOM }}
        trackUserLocation={followUser && showUserLocation ? 'default' : undefined}
      />
      {showUserLocation && <NativeUserLocation />}
      {route && (
        <GeoJSONSource id="route" data={route}>
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': colors.accent, 'line-width': 5 }}
          />
        </GeoJSONSource>
      )}
    </Map>
  );
}
