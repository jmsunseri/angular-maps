﻿import { Injectable, NgZone } from "@angular/core";
import { Observer } from "rxjs/Observer";
import { Observable } from "rxjs/Observable";
import { } from "bingmaps/scripts/MicrosoftMaps/Microsoft.Maps";

import { MapService } from "./mapservice";
import { MapAPILoader } from "./mapapiloader";
import { BingMapAPILoader, BingMapAPILoaderConfig } from "./bingmapapiloader"
import { BingConversions } from "./bingconversions"
import { Marker } from "../models/marker";
import { MarkerTypeId } from "../models/markertypeid";
import { InfoWindow } from "../models/infowindow"
import { BingMarker } from "../models/bingmarker";
import { Layer } from "../models/layer";
import { BingLayer } from "../models/binglayer";
import { BingInfoWindow } from "../models/binginfowindow";
import { ILayerOptions} from "../interfaces/ilayeroptions"; 
import { IMapOptions } from "../interfaces/imapoptions";
import { ILatLong } from "../interfaces/ilatlong";
import { IPoint } from "../interfaces/ipoint";
import { IMarkerOptions } from "../interfaces/imarkeroptions";
import { IMarkerIconInfo } from "../interfaces/imarkericoninfo";
import { IInfoWindowOptions } from "../interfaces/iinfowindowoptions";

///
/// Wrapper class that handles the communication with the Bing Maps Javascript
/// API v8
///
@Injectable()
export class BingMapService implements MapService {
    private _map: Promise<Microsoft.Maps.Map>;
    private _mapInstance: Microsoft.Maps.Map;
    private _mapResolver: (value?: Microsoft.Maps.Map) => void;
    private _config: BingMapAPILoaderConfig;

    constructor(private _loader: MapAPILoader, private _zone: NgZone) {
        this._map = new Promise<Microsoft.Maps.Map>((resolve: () => void) => { this._mapResolver = resolve; });
        this._config = (<BingMapAPILoader>this._loader).Config;
    }

    public CreateMap(el: HTMLElement, mapOptions: IMapOptions): Promise<void> {
        return this._loader.Load().then(() => {
            if (this._mapInstance != null) this.DisposeMap();
            let o: Microsoft.Maps.IMapLoadOptions = BingConversions.TranslateLoadOptions(mapOptions);
            if (!o.credentials) o.credentials = this._config.apiKey;
            let map = new Microsoft.Maps.Map(el, o);
            this._mapInstance = map;
            this._mapResolver(map);
            return;
        });
    }

    public DisposeMap(): void {
        if (this._map == null && this._mapInstance == null) return;
        if (this._mapInstance != null) {
            this._mapInstance.dispose();
            this._mapInstance = null;
            this._map = new Promise<Microsoft.Maps.Map>((resolve: () => void) => { this._mapResolver = resolve; });
        } 
    }

    public LocationToPoint(loc: ILatLong): Promise<IPoint> {
        return this._map.then((m: Microsoft.Maps.Map) => {
            let l: Microsoft.Maps.Location = BingConversions.TranslateLocation(loc);
            let p: Microsoft.Maps.Point = <Microsoft.Maps.Point>m.tryLocationToPixel(l, Microsoft.Maps.PixelReference.control);
            if (p != null) return { x: p.x, y: p.y };
            return null;
        })
    }

    public SetViewOptions(options: IMapOptions) {
        this._map.then((m: Microsoft.Maps.Map) => {
            let o: Microsoft.Maps.IViewOptions = BingConversions.TranslateViewOptions(options);
            m.setView(o);
        });
    }

    public SetMapOptions(options: IMapOptions) {
        this._map.then((m: Microsoft.Maps.Map) => {
            let o: Microsoft.Maps.IMapOptions = BingConversions.TranslateOptions(options);
            m.setOptions(o);
        });
    }

    ///
    /// Creates a Bing map layer with the map context
    ///
    public CreateLayer(options: ILayerOptions): Promise<Layer> {
        return this._map.then((map: Microsoft.Maps.Map) => {
            let layer: Microsoft.Maps.Layer = new Microsoft.Maps.Layer(options.id.toString());
            map.layers.insert(layer);
            return new BingLayer(layer, this);
        });
    }

    ///
    /// Creates a Bing map marker with the map context
    ///
    public CreateMarker(options: IMarkerOptions = <IMarkerOptions>{}): Promise<Marker> {
        return this._map.then((map: Microsoft.Maps.Map) => {
            let loc: Microsoft.Maps.Location = BingConversions.TranslateLocation(options.position);
            let o: Microsoft.Maps.IPushpinOptions = BingConversions.TranslateMarkerOptions(options);
            if (o.icon == null) {
                let s: number = 48;
                let iconInfo: IMarkerIconInfo = {
                    markerType: MarkerTypeId.CanvasMarker,
                    rotation: 45,
                    drawingOffset: { x: 24, y: 0 },
                    points: [
                        { x: 10, y: 40 },
                        { x: 24, y: 30 },
                        { x: 38, y: 40 },
                        { x: 24, y: 0 }
                    ],
                    color: "#f00",
                    size: { width: s, height: s }
                };
                o.icon = Marker.CreateMarker(iconInfo);
                o.anchor = new Microsoft.Maps.Point(iconInfo.size.width * 0.75, iconInfo.size.height * 0.25);
                o.textOffset = new Microsoft.Maps.Point(0, iconInfo.size.height * 0.66);
            }
            let pushpin: Microsoft.Maps.Pushpin = new Microsoft.Maps.Pushpin(loc, o);
            map.entities.push(pushpin);
            return new BingMarker(pushpin);
        });
    }

    ///
    /// Creates an information window for a map position
    ///
    public CreateInfoWindow(options?: IInfoWindowOptions): Promise<InfoWindow> {
        return this._map.then((map: Microsoft.Maps.Map) => {
            let loc: Microsoft.Maps.Location;
            if (options.position == null) loc = map.getCenter();
            else {
                loc = new Microsoft.Maps.Location(options.position.latitude, options.position.longitude);
            }
            let infoBox: Microsoft.Maps.Infobox = new Microsoft.Maps.Infobox(loc, BingConversions.TranslateInfoBoxOptions(options));
            infoBox.setMap(map);
            return new BingInfoWindow(infoBox);
        });
    }

    public DeleteLayer(layer: Layer): Promise<void> {
        return this._map.then((map: Microsoft.Maps.Map) => {
            map.layers.remove(layer.NativePrimitve);
        });        
    }

    public SubscribeToMapEvent<E>(eventName: string): Observable<E> {
        return Observable.create((observer: Observer<E>) => {
            this._map.then((m: Microsoft.Maps.Map) => {
                Microsoft.Maps.Events.addHandler(m, eventName, (e: any) => {
                    this._zone.run(() => observer.next(e));
                });
            });
        });
    }

    public SetCenter(latLng: ILatLong): Promise<void> {
        return this._map.then((map: Microsoft.Maps.Map) => map.setView({
            center: BingConversions.TranslateLocation(latLng)
        }));
    }

    public GetZoom(): Promise<number> {
        return this._map.then((map: Microsoft.Maps.Map) => map.getZoom());
    }

    public SetZoom(zoom: number): Promise<void> {
        return this._map.then((map: Microsoft.Maps.Map) => map.setView({
            zoom: zoom
        }));
    }

    public GetCenter(): Promise<ILatLong> {
        return this._map.then((map: Microsoft.Maps.Map) => {
            let center = map.getCenter();
            return <ILatLong>{
                latitude: center.latitude,
                longitude: center.longitude
            };
        });
    }

    ///
    /// Triggers the given event name on the map instance.
    ///
    public TriggerMapEvent(eventName: string): Promise<void> {
        return this._map.then((m) => Microsoft.Maps.Events.invoke(m, eventName, null));
    }

}