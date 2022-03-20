// GJS import system
declare var imports: any;
declare var global: any;
import {log} from './logging';

import {ClutterActor, StBoxLayout, StButton, StWidget, Window} from "./gnometypes";

import {
    areEqual,
    getCurrentWindows,
    getCurrentWindowsOnMonitor,
    getWorkAreaByMonitor,
    Monitor,
    WorkArea
} from './monitors';
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
    public widget: StWidget;
    public index: number = 0;
    styleClass: string = 'grid-preview'

    constructor(x: number, y: number, width: number, height: number, margin: number) {
        super(x, y, width, height, margin);
        this.widget = new St.BoxLayout({style_class: this.styleClass});
        this.widget.visible = false;
        this.widget.x = this.innerX;
        this.widget.y = this.innerY;
        this.widget.height = this.innerHeight;
        this.widget.width = this.innerWidth;
        Main.uiGroup.insert_child_above(this.widget, global.window_group);
    }

    positionChanged() {
        super.positionChanged();
        this.widget.x = this.innerX;
        this.widget.y = this.innerY;
    }

    sizeChanged() {
        super.sizeChanged();
        this.widget.height = this.innerHeight;
        this.widget.width = this.innerWidth;
    }

    public hide() {
        this.widget.visible = false;
        this.widget.remove_style_pseudo_class('activate');
    }

    public show() {
        this.widget.visible = true;
        this.widget.add_style_pseudo_class('activate');
    }

    public hover(hovering: boolean) {
        // this is needed to highlight windows on hover
        // while dragging a window in the zone
        hovering
            ? this.widget.add_style_pseudo_class('hover')
            : this.widget.remove_style_pseudo_class('hover');
    }

    public adjustWindows(windows: Window[]) {
        log(`${this.constructor.name}::adjustWindows ${windows.length} (${this.innerRect.toString()})`);
        windows.forEach(w => this.moveWindowToInnerRect(w));
    }
    
    private moveWindowToInnerRect(win: Window) {
        log(`${this.constructor.name}::moveWindowToInnerRect ${win.get_wm_class()} (${win.get_id()}) to ${this.innerRect.toString()}`);
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
        this.hide();
        Main.uiGroup.remove_actor(this.widget);
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
        super.destroy();
        this.tabs.forEach(t => t.destroy());
        this.tabs = [];
    }

    adjustWindows(windows: Window[]) {
        log(`TabbedZone: adjustWindows ${windows.length}`);
        this.tabs.forEach(t => t.destroy());
        this.tabs = [];

        if (windows.length > 1) {
            // Create tab widgets
            let x = super.innerX;
            for (let win of windows) {
                let zoneTab = new ZoneTab(win);
                zoneTab.buttonWidget.height = this.tabHeight;
                zoneTab.buttonWidget.width = this.tabWidth;
                zoneTab.buttonWidget.x = x;
                zoneTab.buttonWidget.y = super.innerY;
                zoneTab.buttonWidget.visible = true;
                x += zoneTab.buttonWidget.width;
                this.tabs.push(zoneTab);
            }
        }

        super.adjustWindows(windows);
    }
}

export class ZoneTab {
    public buttonWidget: StButton;

    constructor(private readonly window: Window) {
        this.window = window;
        this.buttonWidget = new St.Button({style_class: 'tab-button'});
        this.buttonWidget.label = window.title;
        this.buttonWidget.connect('button-press-event', () => {
            Main.activateWindow(this.window);
        });
        Main.uiGroup.insert_child_above(this.buttonWidget, global.window_group);
    }

    destroy() {
        this.buttonWidget.visible = false;
        Main.uiGroup.remove_child(this.buttonWidget);
    }
}

export class EditableZone extends Zone {
    constructor(private layoutItem: LayoutItem) {
        // todo
        super(0,0,0,0,0);
        this.layoutItem = layoutItem;
    }

    positionChanged() {
        super.positionChanged();
        this.widget.label = `${this.layoutItem.widthPercentage}% x ${this.layoutItem.heightPercentage}%`;
    }

    sizeChanged() {
        super.sizeChanged();
        this.widget.label = `${this.layoutItem.widthPercentage}% x ${this.layoutItem.heightPercentage}%`;
    }

    createWidget(styleClass: string = 'grid-preview') {
        this.widget = new St.Button({style_class: styleClass});
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


interface ZoneWindows {
    zone: Zone;
    windowIds: Set<number>;
}

export class ZoneDisplay {
    protected layout: Layout;
    protected margin: number;
    protected motionConnection: any;
    protected workArea: WorkArea | null;
    protected monitor: Monitor;
    protected zones: Array<ZoneWindows> = [];

    public apply() {
        // var c = this.recursiveChildren();
        // for (var i = 0; i < c.length; i++) {
        //     c[i].applyPercentages();
        // }
    }

    constructor(monitor: Monitor, layout: Layout, margin: number) {
        this.monitor = monitor;
        this.layout = layout;
        this.margin = margin;

        this.workArea = getWorkAreaByMonitor(this.monitor);

        this.init();
    }

    public moveWindowToZoneUnderCursor(win: Window) {
        if (this.zones.length == 0) return;

        let [x, y] = global.get_pointer();
        let newZoneIdx = this.zones.findIndex(zw => zw.zone.contains(x, y));
        if (newZoneIdx === -1) return;

        // remove from old zone
        for (const zw of this.zones) {
            zw.windowIds.delete(win.get_id());
        }

        let zonesTouchedByPointer = this.zones.filter(zw => zw.zone.contains(x, y)).map(zw => zw.zone);

        if(zonesTouchedByPointer.length >= 2) {
            log("Joining zones");
            let newZoneRect = this.getTotalZoneRect(zonesTouchedByPointer);
            let zonesToDeleteIndexes = this.zones.filter(z => newZoneRect.contains(z.zone.rect)).map((_, i) => i);
            
            // Get all windows stored inside those zones and delete the latter
            let windowIds = new Set<number>();
            for (const i of zonesToDeleteIndexes) {
                this.zones[i].windowIds.forEach(wId => windowIds.add(wId));
                this.zones.splice(i, 1);
            }
            log(`Moving ${windowIds.size}`);

            let newZone = this.createZone(
                newZoneRect.origin.x, 
                newZoneRect.origin.y, 
                newZoneRect.size.width, 
                newZoneRect.size.height,
                this.margin);

            newZoneIdx = zonesToDeleteIndexes[0]
            this.zones.splice(newZoneIdx, 0, {zone: newZone, windowIds: windowIds});
            
            for (let i = 0; i < this.zones.length; i++) {
                this.zones[i].zone.index = i;
            }

            log(`Joined zone {${newZone.toString()}`)
        }

        // add to new zone
        this.zones[newZoneIdx].windowIds.add(win.get_id());
        this.applyLayout();
    }

    // Returns the Rect describing the area made by the selected zones found on findX, findY
    // null if findX, findY isn't contained in any zone.
    private getTotalZoneRect(zones: ZoneBase[]): Rect {
        log(`zones selected: ${zones.length}`);

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
        
        let rect = new Rect(new XY(x, y), new Size(w, h));
        log(rect.toString());
        return rect;
    }

    public highlightZonesUnderCursor() {
        let [x, y] = global.get_pointer();
        for (const zw of this.zones) {
            let contained = zw.zone.contains(x, y);
            zw.zone.hover(contained);
        }
    }

    createZone(x: number, y: number, width: number, height: number, margin: number): Zone {
        return new Zone(x, y, width, height, margin);
    }
    
    public init() {
        this.initZones();
        this.initialLayout();
    }
    
    public initZones(){
        if (!this.workArea) {
            log(`Could not get workArea for monitor ${this.monitor.index}`);
            return;
        }

        this.zones.forEach(zw => zw.zone.destroy());
        this.zones = [];

        let x = this.workArea.x;
        let y = this.workArea.y;
        let residualHeightPercentage = 100;

        log(`ZoneDisplay Init: ${JSON.stringify(this.layout)}`);
        for (let index = 0; index < this.layout.items.length; index++) {
            const layoutItem = this.layout.items[index];

            // Create a new zone, starting
            let zone = this.createZone(
                x,
                y,
                (this.workArea.width * layoutItem.widthPercentage / 100),
                (this.workArea.height * layoutItem.heightPercentage / 100),
                this.margin
            );
            zone.index = index;

            this.zones.push({zone, windowIds: new Set<number>()});
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
        log(`Created ${this.zones.length} zones`);
    }

    public initialLayout() {
        let monitorWindows = getCurrentWindowsOnMonitor(this.monitor);
        log(`Initial Layout windows start ${monitorWindows.length}`);
        for (const zw of this.zones) {
            for (const win of monitorWindows) {
                let outerRect = win.get_frame_rect();
                let midX = outerRect.x + (outerRect.width / 2);
                let midY = outerRect.y + (outerRect.height / 2);

                if (zw.zone.contains(midX, midY)) {
                    log(`Pushing ${win.get_wm_class()} (${win.get_id()}) to ${zw.zone.innerRect.toString()}`);
                    zw.windowIds.add(win.get_id());
                }
            }
        }

        log('Initial Layout windows end');
    }

    // Add window to the nearest free zone.
    private addWindow(win: Window) {
        // First, let's see if we have free zones available
        let zonesToConsider = this.zones.filter(zw => zw.windowIds.size === 0);

        if (zonesToConsider.length === 0) {
            // No free zone, we will consider all zones then
            zonesToConsider = this.zones;
        } else if (zonesToConsider.length === 1) {
            // Only one free zone available, put the window there and return
            zonesToConsider[0].windowIds.add(win.get_id());
            return;
        }

        // Second, find the nearest zone
        let nearestZone = zonesToConsider.reduce((previousValue: ZoneWindows, currentValue: ZoneWindows) => {
                let winRect = win.get_frame_rect();
                let winMid = new XY(winRect.x + (winRect.width / 2), winRect.y + (winRect.height / 2));
                let previousMid = new XY(previousValue.zone.x + (previousValue.zone.width / 2), previousValue.zone.y + (previousValue.zone.height / 2));
                let currentMid = new XY(currentValue.zone.x + (currentValue.zone.width / 2), currentValue.zone.y + (currentValue.zone.height / 2));
                let currentDistance = winMid.distance(currentMid);
                let previousDistance = winMid.distance(previousMid);
                return currentDistance > previousDistance ? currentValue : previousValue;
            },
            zonesToConsider[0]);

        // Add to new zone
        log(`Pushing ${win.get_wm_class()} (${win.get_id()}) to ${nearestZone.zone.innerRect.toString()}`);
        nearestZone.windowIds.add(win.get_id());
    }

    public applyLayout() {
        if(this.zones.length === 0) return;

        let currentWindows = getCurrentWindows();
        
        // Add new windows not previously known
        let knownWindowIds = new Set<number>(this.zones.map(zw => Array.from(zw.windowIds)).flat());
        let newWindows = currentWindows.filter(w => !knownWindowIds.has(w.get_id()));
        newWindows.forEach(w => this.addWindow(w));
            
        for (const zw of this.zones) {
            // Remove destroyed windows still lingering in the zone windowIds set
            let currentZoneWindows = currentWindows.filter(w => zw.windowIds.has(w.get_id()));
            zw.windowIds = new Set(currentZoneWindows.map(w => w.get_id()));

            // Adjust windows inside the zone
            zw.zone.adjustWindows(currentZoneWindows);
        }
    };

    public reinit() {
        let wa = getWorkAreaByMonitor(this.monitor);
        if (!this.workArea || !wa) {
            log(`Could not get workArea for monitor ${this.monitor.index}`);
            return;
        }

        if (!areEqual(this.workArea, wa)) {
            this.workArea = wa;
            this.initZones();
        }
    }

    public hide() {
        this.zones.forEach(zw => zw.zone.hide());
    }

    public show() {
        this.zones.forEach(zw => zw.zone.show());
    }

    public destroy() {
        log('ZoneDisplay destroy');
        this.zones.forEach(zw => zw.zone.destroy());
    }
}

export class ZoneEditor extends ZoneDisplay {
    public stage: StBoxLayout | null = null;
    public motionConnection = null;
    public anchors: ZoneAnchor[];

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
    }

    public show() {
        super.show();
        for (let i = 0; i < this.anchors.length; i++) {
            this.anchors[i].show();
        }
    }
}

export class ZonePreview extends ZoneDisplay {
    constructor(monitor: Monitor, layout: Layout, margin: number) {
        super(monitor, layout, margin);
    }
}

export class ZoneManager extends ZoneDisplay {
    private isShowing: boolean = false;

    constructor(monitor: Monitor, layout: Layout, margin: number) {
        super(monitor, layout, margin);
    }

    public show() {
        this.init();
        super.show();
        this.isShowing = true;
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
    constructor(monitor: Monitor, layout: Layout, margin: number) {
        super(monitor, layout, margin);
    }

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
