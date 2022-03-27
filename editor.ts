// GJS import system
declare var imports: any;
declare var global: any;
import {log} from './logging';

import {ClutterActor, StBoxLayout, StButton, StWidget, Window} from "./gnometypes";

import {areEqual, getCurrentWindows, getWorkAreaByMonitor, Monitor, WorkArea} from './monitors';
import {joinType, JoinType, Rect, Size, XY} from './tilespec';
import {Layout, LayoutItem} from './layouts';

// Library imports
const St = imports.gi.St;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const ModalDialog = imports.ui.modalDialog;
const Mainloop = imports.mainloop;

// TODO: expose as setting
const HIGHLIGHT_MARGIN = 16;

export class ZoneBase {
    constructor(
        private _x: number = 0,
        private _y: number = 0,
        private _width: number = 0,
        private _height: number = 0,
        private _margin: number = 0) {
    }

    public contains(x: number, y: number, width: number = 1, height: number = 1): boolean {
        // log(`x: ${x}`);
        // log(`y: ${y}`);
        // log(`this.x: ${this.x}`);
        // log(`this.y: ${this.y}`);
        // log(`this.totalWidth: ${this.totalWidth}`);
        // log(`this.totalHeight: ${this.totalHeight}`);
        // log(`${Math.max(0, this.x - HIGHLIGHT_MARGIN)}`);
        // log(`${Math.max(0, this.y - HIGHLIGHT_MARGIN)}`);
        // log("---")
        return (
            Math.max(0, this.x - HIGHLIGHT_MARGIN) <= x &&
            Math.max(0, this.y - HIGHLIGHT_MARGIN) <= y &&
            this.x + this.totalWidth + HIGHLIGHT_MARGIN >= x + width &&
            this.y + this.totalHeight + HIGHLIGHT_MARGIN >= y + height
        );
    }

    public get rect(): Rect {
        return new Rect(
            new XY(this.x, this.y),
            new Size(this.width, this.height)
        );
    }

    public get innerRect(): Rect {
        return new Rect(
            new XY(this.innerX, this.innerY),
            new Size(this.innerWidth, this.innerHeight)
        );
    }

    public get totalWidth() {
        return (this._margin * 2) + this.width;
    }

    public get totalHeight() {
        return (this._margin * 2) + this.height;
    }

    public get innerX(): number {
        return this.x + this._margin;
    }

    public get innerY(): number {
        return this.y + this._margin;
    }

    public get innerWidth(): number {
        return this.width - (this._margin * 2);
    }

    public get innerHeight(): number {
        return this.height - (this._margin * 2);
    }

    public get x(): number {
        return this._x;
    }

    public set x(v: number) {
        if (this._x !== v) {
            this._x = v;
            this.positionChanged();
        }
    }

    public get y(): number {
        return this._y;
    }

    public set y(v: number) {
        if (this._y !== v) {
            this._y = v;
            this.positionChanged();
        }
    }

    public get width(): number {
        return this._width;
    }

    public set width(v: number) {
        if (this._width !== v) {
            this._width = v;
            this.sizeChanged();
        }
    }

    public get height(): number {
        return this._height;
    }

    public set height(v: number) {
        if (this._height !== v) {
            this._height = v;
            this.sizeChanged();
        }
    }
    
    public get margin(): number {
        return this._margin;
    }

    public set margin(v: number) {
        if (this._margin !== v) {
            this._margin = v;
            this.sizeChanged();
        }
    }

    public positionChanged() {

    }

    public sizeChanged() {

    }

    sizeLeft(delta: number) {
        this.x += delta;
        this.width -= delta;
    }

    sizeRight(delta: number) {
        this.width += delta;
    }

    sizeTop(delta: number) {
        this.y += delta;
        this.height -= delta;
    }

    sizeBottom(delta: number) {
        this.height += delta;
    }
}

export class Zone extends ZoneBase {
    public windowIds: Set<number> = new Set<number>();

    public widget: StWidget | null;
    public index: number = 0;
    styleClass: string = 'grid-preview'

    constructor(x: number, y: number, width: number, height: number, margin: number) {
        super(x, y, width, height, margin);
        this.widget = new St.BoxLayout({style_class: this.styleClass});
        if(!this.widget) return;

        this.widget.visible = false;
        this.widget.x = this.innerX;
        this.widget.y = this.innerY;
        this.widget.height = this.innerHeight;
        this.widget.width = this.innerWidth;
        Main.uiGroup.insert_child_above(this.widget, global.window_group);
    }

    positionChanged() {
        if(!this.widget) return;
        super.positionChanged();
        this.widget.x = this.innerX;
        this.widget.y = this.innerY;
    }

    sizeChanged() {
        if(!this.widget) return;
        super.sizeChanged();
        this.widget.height = this.innerHeight;
        this.widget.width = this.innerWidth;
    }

    public hide() {
        if(!this.widget) return;
        this.widget.visible = false;
        this.widget.remove_style_pseudo_class('activate');
    }

    public show() {
        if(!this.widget) return;
        this.widget.visible = true;
        this.widget.add_style_pseudo_class('activate');
    }

    public hover(hovering: boolean) {
        if(!this.widget) return;
        
        // this is needed to highlight windows on hover
        // while dragging a window in the zone
        hovering
            ? this.widget.add_style_pseudo_class('hover')
            : this.widget.remove_style_pseudo_class('hover');
    }

    public adjustWindows(currentWindows: readonly Window[]) {
        let myWindows = currentWindows.filter(w => this.windowIds.has(w.get_id()))
        log(`${this.toString()}::adjustWindows ${myWindows.length}`);
        myWindows.forEach(w => this.moveWindowToZone(w));
    }

    public moveWindowToZone(win: Window) {
        log(`${this.toString()}::moveWindowToInnerRect ${win.get_wm_class()} (${win.get_id()}) to ${this.innerRect.toString()}`);
        win.move_frame(true, this.innerRect.origin.x, this.innerRect.origin.y);
        win.move_resize_frame(true, 
            this.innerRect.origin.x,
            this.innerRect.origin.y,
            this.innerRect.size.width,
            this.innerRect.size.height);
    }

    public toString() {
        return `${this.constructor.name} ${this.index}: ${this.innerRect.toString()}`
    }

    public destroy() {
        if(!this.widget) return;
        this.hide();
        Main.uiGroup.remove_actor(this.widget);
        this.widget = null;
    }
}

export class TabbedZone extends Zone {
    public tabHeight: number = 50;
    public tabWidth: number = 200;
    public tabs: ZoneTab[] = [];

    get innerY(): number {
        if (this.tabs && this.tabs.length > 1) {
            return super.innerY + this.margin + this.tabHeight;
        }
        return super.innerY;
    }

    get innerHeight(): number {
        if (this.tabs && this.tabs.length > 1) {
            return super.innerHeight - this.margin - this.tabHeight;
        }
        return super.innerHeight;
    }

    destroy() {
        this.tabs.forEach(t => t.destroy());
        this.tabs = [];
        super.destroy();
    }


    public adjustWindows(currentWindows: readonly Window[]) {
        let myWindows = currentWindows.filter(w => this.windowIds.has(w.get_id()))
        log(`${this.toString()}:: adjustWindows ${myWindows.length}`);
        this.tabs.forEach(t => t.destroy());
        this.tabs = [];

        if (myWindows.length > 1) {
            // Create tab widgets
            let x = super.innerX;
            for (let win of myWindows) {
                let zoneTab = new ZoneTab(win, new Rect(
                    new XY(x, super.innerY),
                    new Size(this.tabWidth, this.tabHeight)
                ));
                x += this.tabWidth;
                this.tabs.push(zoneTab);
            }
        }

        super.adjustWindows(currentWindows);
    }
}

export class ZoneTab {
    public buttonWidget: StButton | null;

    constructor(private readonly window: Window, rect: Rect) {
        this.buttonWidget = new St.Button({style_class: 'tab-button'});
        if(!this.buttonWidget) return;
        this.buttonWidget.x = rect.origin.x;
        this.buttonWidget.y = rect.origin.y;
        this.buttonWidget.width = rect.size.width;
        this.buttonWidget.height = rect.size.height;
        this.buttonWidget.visible = true;
        this.buttonWidget.label = window.title;
        this.buttonWidget.connect('button-press-event', () => {
            Main.activateWindow(this.window);
        });
        Main.uiGroup.insert_child_above(this.buttonWidget, global.window_group);
    }

    destroy() {
        if(!this.buttonWidget) return;
        this.buttonWidget.visible = false;
        Main.uiGroup.remove_child(this.buttonWidget);
        this.buttonWidget = null;
    }
}

export class EditableZone extends Zone {
    // todo
    constructor(private layoutItem: LayoutItem) {
        super(0,0,0,0,0);
        this.widget = new St.Button({style_class: 'grid-preview'});
        if(!this.widget) return;

        this.widget.connect('button-press-event', (_actor: ClutterActor, event: any) => {
            let btn = event.get_button();
            if (btn == 1) {
                log("Splitting");
                //this.parent?.split(this);
            }

            if (btn == 2) {
                //this.parent?.splitOtherDirection(this);
            }

            if (btn == 3) {
                //this.parent?.remove(this);
            }
        });
    }

    positionChanged() {
        if(!this.widget) return;
        super.positionChanged();
        this.widget.label = `${this.layoutItem.widthPercentage}% x ${this.layoutItem.heightPercentage}%`;
    }

    sizeChanged() {
        if(!this.widget) return;

        super.sizeChanged();
        this.widget.label = `${this.layoutItem.widthPercentage}% x ${this.layoutItem.heightPercentage}%`;
    }
}

export enum ZoneAnchorType {
    Vertical,
    Horizontal,
}

export class ZoneAnchor {
    private readonly widget: StButton;
    public startX = 0;
    public startY = 0;
    public isMoving: boolean = false;
    public motionConnection = null;

    constructor(
        protected zoneA: ZoneBase,
        protected zoneB: ZoneBase,
        protected type: ZoneAnchorType,
        protected margin: number) {
        this.widget = new St.Button({style_class: 'size-button'});
        this.widget.label = " = ";
        this.widget.visible = true;
        this.adjustSizes();
        this.widget.connect('button-press-event', () => {
            let [x, y] = global.get_pointer();
            this.startX = x;
            this.startY = y;
            this.isMoving = !this.isMoving;
        });
        this.widget.connect('button-release-event', () => {
            //this.isMoving = false;
        });

        //this.widgets.push(sizeButton);
        Main.uiGroup.insert_child_above(this.widget, global.window_group);
    }

    public adjustSizes() {
        if (this.type == ZoneAnchorType.Horizontal) {
            this.widget.x = this.zoneA.x + this.zoneA.width - this.margin;
            this.widget.y = this.zoneA.y + this.margin;
            this.widget.width = this.margin * 2;
            this.widget.height = this.zoneA.height - (this.margin * 2);
        } else {
            this.widget.y = this.zoneA.y + this.zoneA.height - this.margin;
            this.widget.x = this.zoneA.x + this.margin;
            this.widget.height = this.margin * 2;
            this.widget.width = this.zoneA.width - (this.margin * 2);
        }
    }

    public x(v: number | null = null): number {
        if (v != null) {
            return this.widget.x = v;
        }
        return this.widget.x;
    }

    public y(v: number | null = null): number {
        if (v != null) {
            return this.widget.y = v;
        }
        return this.widget.y;
    }

    public width(v: number | null = null): number {
        if (v != null) {
            return this.widget.width = v;
        }
        return this.widget.width;
    }

    public height(v: number | null = null): number {
        if (v != null) {
            return this.widget.height = v;
        }
        return this.widget.height;
    }

    public hide() {
        this.widget.visible = false;
        this.widget.remove_style_pseudo_class('activate');
    }

    public show() {
        this.widget.visible = true;
        this.widget.add_style_pseudo_class('activate');
    }

    public destroy() {
        this.hide();
        Main.uiGroup.remove_child(this.widget);
    }

    mouseMoved(x: number, y: number) {
        if (this.isMoving) {
            if (this.type == ZoneAnchorType.Horizontal) {
                let delta = x - this.startX;
                this.zoneA.sizeRight(delta);
                this.zoneB.sizeLeft(delta);
                this.startX = x;
            } else {
                let delta = y - this.startY;
                this.zoneA.sizeBottom(delta);
                this.zoneB.sizeTop(delta);
                this.startY = y;
            }
        }
    }
}

export class ZoneDisplay {
    protected layout: Layout;
    protected margin: number;
    protected motionConnection: any;
    protected workArea: WorkArea | null;
    protected monitor: Monitor;
    protected zones: Zone[] = [];

    constructor(monitor: Monitor, layout: Layout, margin: number) {
        this.monitor = monitor;
        this.layout = layout;
        this.margin = margin;

        this.workArea = getWorkAreaByMonitor(this.monitor);

        this.init();
    }
    
    public toString() {
        return `${this.constructor.name}(${this.layout.name})`;
    }

    public init() {
        if (!this.workArea) {
            log(`Could not get workArea for monitor ${this.monitor.index}`);
            return;
        }

        this.zones.forEach(z => z.destroy());
        this.zones = [];

        let x = this.workArea.x;
        let y = this.workArea.y;
        let residualHeightPercentage = 100;

        log(`${this.toString()}::Init: ${JSON.stringify(this.layout)}`);
        for (let index = 0; index < this.layout.items.length; index++) {
            const layoutItem = this.layout.items[index];

            // Create a new zone, starting
            let zone = this.createZone(
                x,
                y,
                Math.trunc(this.workArea.width * layoutItem.widthPercentage / 100),
                Math.trunc(this.workArea.height * layoutItem.heightPercentage / 100),
                this.margin
            );
            zone.index = index;

            this.zones.push(zone);
            log(zone.toString());

            // advance the origin for the next zone
            residualHeightPercentage = residualHeightPercentage - layoutItem.heightPercentage;
            if (residualHeightPercentage != 0) {
                // more vertical space left
                y += zone.height;
            } else {
                // advance to the next column
                x += zone.width;
                y = this.workArea.y;
                residualHeightPercentage = 100;
            }
        }
        log(`${this.toString()} Created ${this.zones.length} zones`);
    }

    createZone(x: number, y: number, width: number, height: number, margin: number): Zone {
        return new Zone(x, y, width, height, margin);
    }
    
    public hide() {
        this.zones.forEach(z => z.hide());
    }

    public show() {
        this.zones.forEach(z => z.show());
    }

    public destroy() {
        log(`${this.toString()}::Destroy`);
        this.zones.forEach(z => z.destroy());
    }
}

export class ZoneEditor extends ZoneDisplay {
    public stage: StBoxLayout | null = null;
    public motionConnection = null;
    public anchors: ZoneAnchor[];
    public _isEditing = false;

    constructor(monitor: Monitor, layout: Layout, margin: number) {
        super(monitor, layout, margin);
        this.anchors = [];
    }

    public init() {
        if (this.anchors == null) {
            this.anchors = [];
        }
        super.init();
        this.motionConnection = global.stage.connect("motion-event", () => {
            let [x, y] = global.get_pointer();
            for (let i = 0; i < this.anchors.length; i++) {
                this.anchors[i].mouseMoved(x, y);

            }
            for (let i = 0; i < this.anchors.length; i++) {
                this.anchors[i].adjustSizes();
            }
            this.apply();
        });
    }

    public apply() {
        // var c = this.recursiveChildren();
        // for (var i = 0; i < c.length; i++) {
        //     c[i].applyPercentages();
        // }
    }

    public destroy() {
        super.destroy();
        global.stage.disconnect(this.motionConnection);
        for (let i = 0; i < this.anchors.length; i++) {
            this.anchors[i].destroy();
        }
        this.anchors = [];
    }

    public hide() {
        super.hide();
        for (let i = 0; i < this.anchors.length; i++) {
            this.anchors[i].hide();
        }
        this._isEditing = false;
    }

    public show() {
        this._isEditing = true;
        super.show();
        for (let i = 0; i < this.anchors.length; i++) {
            this.anchors[i].show();
        }
    }
    
    public get isEditing() { return this._isEditing; }
}

export class ZonePreview extends ZoneDisplay {

}

export class ZoneManager extends ZoneDisplay {
    private isShowing: boolean = false;
    protected virtualZones: Zone[] = [];

    public highlightZonesUnderCursor() {
        let [x, y] = global.get_pointer();
        for (const zone of this.zones) {
            let contained = zone.contains(x, y);
            zone.hover(contained);
        }
    } 

    public init() {
        this.virtualZones?.forEach(z => z.destroy());
        this.virtualZones = [];
        super.init();
        this.initialLayout();
    }

    public initialLayout() {
        let currentWindows = getCurrentWindows();
        log(`${this.toString()} Initial Layout windows start ${currentWindows.length}`);
        for (const zone of this.zones) {
            let windows = this.windowsCurrentlyPresentInZone(zone);
            for(const win of windows) {
                zone.windowIds.add(win.get_id());
            }
            zone.adjustWindows(currentWindows);
        }

        log(`${this.toString()} Initial Layout windows end`);
    }

    public destroy() {
        log(`${this.toString()}::Destroy`);
        this.virtualZones.forEach(z => z.destroy());
        super.destroy();
    }

    // Add window to the nearest free zone.
    public addWindow(win: Window) {
        let winId = win.get_id();

        // First, let's see if we have free zones available
        let zonesToConsider = this.zones.filter(z => z.windowIds.size === 0);

        if (zonesToConsider.length === 1) {
            // Only one free zone available, put the window there and return
            zonesToConsider[0].windowIds.add(winId);
            this.applyLayout();
            return;
        }

        if (zonesToConsider.length === 0) {
            // No free zone, we will consider all zones then
            zonesToConsider = this.zones;
        }

        // Second, find the nearest zone
        let nearestZone = zonesToConsider.reduce((previousValue: Zone, currentValue: Zone) => {
                let winRect = win.get_frame_rect();
                let winMid = new XY(winRect.x + (winRect.width / 2), winRect.y + (winRect.height / 2));
                let previousMid = new XY(previousValue.x + (previousValue.width / 2), previousValue.y + (previousValue.height / 2));
                let currentMid = new XY(currentValue.x + (currentValue.width / 2), currentValue.y + (currentValue.height / 2));
                let currentDistance = winMid.distance(currentMid);
                let previousDistance = winMid.distance(previousMid);
                return currentDistance < previousDistance ? currentValue : previousValue;
            },
            zonesToConsider[0]);

        // Add to the zone
        log(`${this.toString()} Pushing ${win.get_wm_class()} (${winId}) to ${nearestZone.toString()}`);
        this.zonesCleanup([winId]);
        nearestZone.windowIds.add(winId);
        this.applyLayout();
    }

    private zonesCleanup(removedWindowIds: number[])
    {
        // Remove the window ids from any zone and virtual zones
        for (const vz of this.zones.concat(this.virtualZones))
            for(const wid of removedWindowIds)
                vz.windowIds.delete(wid);

        // Destroy and remove dead virtual zones  
        for(const vz of this.virtualZones.filter(vz => vz.windowIds.size == 0)) {
            vz.destroy();
        }

        this.virtualZones = this.virtualZones.filter(vz => vz.windowIds.size > 0);
    }

    public moveWindowToZoneUnderCursor(win: Window) {
        if (this.zones.length == 0) return;

        let winId = win.get_id();

        let [x, y] = global.get_pointer();

        let zonesTouchedByPointer = this.zones.filter(z => z.contains(x, y));
        if (zonesTouchedByPointer.length == 1) {
            let zone = this.zones.find(z => z.contains(x, y));
            if (!zone) return;

            this.zonesCleanup([winId]);
            zone.windowIds.add(winId);
        } else {
            let virtualZoneRect = this.getTotalZoneRect(zonesTouchedByPointer);
            let virtualZone = this.createZone(
                virtualZoneRect.origin.x,
                virtualZoneRect.origin.y,
                virtualZoneRect.size.width,
                virtualZoneRect.size.height,
                this.margin);

            // The intention is to create a new virtual zone that contains
            // every window found in it's area. We do this because we still want to use
            // zone tabs in a useful manner.
            let currentVirtualZoneWindows = this.windowsCurrentlyPresentInZone(virtualZone);
            currentVirtualZoneWindows.push(win);
            let virtualZoneWindowIds = currentVirtualZoneWindows.map(w => w.get_id());
            virtualZone.windowIds = new Set<number>(virtualZoneWindowIds);

            // Since these windows are now part of a new virtual zone, remove them
            // from the other zones
            this.zonesCleanup(virtualZoneWindowIds);
            this.virtualZones.push(virtualZone);
            log(`${this.toString()} Moved window to virtual zone {${virtualZone.toString()}`)
        }

        this.applyLayout();
    }

    public windowsCurrentlyPresentInZone(zone: Zone) : Window[] {
        let currentWindows = getCurrentWindows();
        let result = new Array<Window>();
        for(const win of currentWindows) {
            let outerRect = win.get_frame_rect();
            let midX = outerRect.x + (outerRect.width / 2);
            let midY = outerRect.y + (outerRect.height / 2);
            if (zone.contains(midX, midY)) {
                result.push(win);
            }
        }
        return result;
    }

    // Returns the Rect describing the area made by the selected zones found on findX, findY
    // null if findX, findY isn't contained in any zone.
    private getTotalZoneRect(zones: ZoneBase[]): Rect {
        // find smallest X,Y
        let x = zones.reduce((p, c) => Math.min(p, c.x), zones[0].x);
        let y = zones.reduce((p, c) => Math.min(p, c.y), zones[0].y);
        let w: number;
        let h: number;

        if(zones.length == 2) {
            let edgesA = zones[0].rect.edges();
            let edgesB = zones[1].rect.edges();
            let horiz = joinType(edgesA, edgesB) === JoinType.Horizontal;
            if (horiz) {
                w = zones.reduce((p, c) => p + c.width, 0);
                h = zones[0].height;
            } else {
                w = zones[0].width;
                h = zones.reduce((p, c) => p + c.height, 0);
            }
        } else {
            // More than two zones, take the bigger area by summing up the widths and heights
            w = zones.reduce((p, c) => p + c.width, 0);
            h = zones.reduce((p, c) => p + c.height, 0);
        }

        return new Rect(new XY(x, y), new Size(w, h));
    }

    public applyLayout() {
        if(this.zones.length === 0) return;

        let currentWindows = getCurrentWindows();
        for (const zone of this.zones) {
            zone.adjustWindows(currentWindows);
        }

        for(const vz of this.virtualZones) {
            vz.adjustWindows(currentWindows);
        }
    };

    public reinit() {
        let wa = getWorkAreaByMonitor(this.monitor);
        if (!this.workArea || !wa) {
            log(`${this.toString()}::reinit Could not get workArea for monitor ${this.monitor.index}`);
            return;
        }

        if (!areEqual(this.workArea, wa)) {
            this.workArea = wa;
            this.init();
        }
    }

    public show() {
        this.isShowing = true;
        super.show();
        this.trackCursorUpdates();
    }

    public hide() {
        this.isShowing = false;
        super.hide();
    }

    private trackCursorUpdates() {
        Mainloop.timeout_add(25, () => {
            if (!this.isShowing) {
                return false;
            }
            this.highlightZonesUnderCursor();
            return true;
        });
    }
}

export class TabbedZoneManager extends ZoneManager {
    public createZone(x: number, y: number, width: number, height: number, margin: number): Zone {
        return new TabbedZone(x, y, width, height, margin);
    }
}

class EntryDialogClass extends ModalDialog.ModalDialog {

    public entry: any | null;
    public label: any | null;
    public onOkay: any | null;

    public _onClose() {
        try {
            this.onOkay(this.entry.text);
        } catch (e) {

            throw e;
        }
    }

    constructor(params: any) {
        super(params);
        log(JSON.stringify(params));
    }

    public _init() {

        super._init({});
        this.setButtons([{
            label: "OK",
            action: () => {
                this.onOkay(this.entry.text);
                this.close(global.get_current_time());
            },
            key: Clutter.Escape
        }]);

        let box = new St.BoxLayout({vertical: true});
        this.contentLayout.add(box);

        this.label = new St.Label({text: ""});
        box.add(this.label);
        box.add(this.entry = new St.Entry({text: ""}));
    }
}

export const EntryDialog = GObject.registerClass({
        GTypeName: 'EntryDialogClass',
    }, EntryDialogClass
);
