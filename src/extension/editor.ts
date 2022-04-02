// GJS import system
declare var imports: any;
declare var global: any;
import { log } from './logging';

import {
    ClutterActor,
    StBoxLayout,
    StButton,
    StWidget,
    Window,
    WindowType,
    WorkspaceManager as WorkspaceManagerInterface
} from "./gnometypes";

import { areEqual, getWorkAreaByMonitor, getWindowsOfMonitor, Monitor, WorkArea } from './monitors';
import { Rect, XY, Size } from './tilespec';
import { Layout, LayoutItem } from './layouts';
import { WINDOW_MARGIN } from './settings_data';

// Library imports
const St = imports.gi.St;
const Main = imports.ui.main;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const ModalDialog = imports.ui.modalDialog;
const Mainloop = imports.mainloop;
const WorkspaceManager: WorkspaceManagerInterface = (global.screen || global.workspace_manager);

// TODO: expose as setting
const HIGHLIGHT_MARGIN = 16;


function moveWindowToRect(win: Window, rect: Rect) {
    log(`Moving window ${win.get_wm_class()} to ${rect.toString()}`);
    win.move_frame(true, rect.origin.x, rect.origin.y);
    win.move_resize_frame(
        true,
        rect.origin.x,
        rect.origin.y,
        rect.size.width,
        rect.size.height);
}

export class ZoneBase {
    public margin: number = 0;

    constructor(
        private _x: number = 0,
        private _y: number = 0,
        private _width: number = 0,
        private _height: number = 0) { }

    public contains(x: number, y: number, width: number = 1, height: number = 1): boolean {
        
        log(`x: ${x}`);
        log(`y: ${y}`);
        log(`this.x: ${this.x}`);
        log(`this.y: ${this.y}`);
        log(`this.totalWidth: ${this.totalWidth}`);
        log(`this.totalHeight: ${this.totalHeight}`);
        log(`${Math.max(0, this.x - HIGHLIGHT_MARGIN)}`);
        log(`${Math.max(0, this.y - HIGHLIGHT_MARGIN)}`);
        log("---")
        return (
            Math.max(0, this.x - HIGHLIGHT_MARGIN) <= x &&
            Math.max(0, this.y - HIGHLIGHT_MARGIN) <= y &&
            this.x + this.totalWidth + HIGHLIGHT_MARGIN >= x + width &&
            this.y + this.totalHeight + HIGHLIGHT_MARGIN >= y + height
        );
    }

    public get innerRect(): Rect {
        return new Rect(
            new XY(this.innerX, this.innerY),
            new Size(this.innerWidth, this.innerHeight)
        );
    }

    public get totalWidth() {
        return (this.margin * 2) + this.width;
    }

    public get totalHeight() {
        return (this.margin * 2) + this.height;
    }

    public get innerX(): number {
        return this.x + this.margin;
    }

    public get innerY(): number {
        return this.y + this.margin;
    }

    public get innerWidth(): number {
        return this.width - (this.margin * 2);
    }

    public get innerHeight(): number {
        return this.height - (this.margin * 2);
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
    styleClass: string = 'grid-preview'

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        super(x, y, width, height);
        this.widget = new St.BoxLayout({ style_class: this.styleClass });
        this.widget.visible = false;
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
        windows.forEach(w => moveWindowToRect(w, this.innerRect));
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
        if (this.tabs.length > 1) {
            return super.innerY + this.tabHeight;
        }
        return super.innerY;
    }

    get innerHeight(): number {
        if (this.tabs.length > 1) {
            return super.innerHeight - this.tabHeight;
        }
        return super.innerHeight;
    }

    createWidget(styleClass: string = 'grid-preview') {
        this.widget = new St.BoxLayout({ style_class: styleClass });
        this.widget.visible = false;
    }

    layoutTabs() {

    }

    destroy() {
        super.destroy();
        while (this.tabs.length > 0) {
            this.tabs[0].destroy();
        }
    }

    adjustWindows(windows: Window[]) {
        super.adjustWindows(windows);
        while (this.tabs.length > 0) {
            this.tabs[0].destroy();
        }
        this.tabs = [];
        let x = this.x + this.margin;
        for (let i = 0; i < windows.length; i++) {
            let metaWindow = windows[i];
            let outerRect = metaWindow.get_frame_rect();

            let midX = outerRect.x + (outerRect.width / 2);
            let midY = outerRect.y + (outerRect.height / 2);

            if (this.contains(midX, midY)) {
                let zoneTab = new ZoneTab(this, metaWindow);
                zoneTab.buttonWidget.height = this.tabHeight - (this.margin * 2);
                zoneTab.buttonWidget.width = this.tabWidth;
                zoneTab.buttonWidget.x = x;
                zoneTab.buttonWidget.y = this.y + this.margin;
                zoneTab.buttonWidget.visible = true;
                x += zoneTab.buttonWidget.width + this.margin;
            }
        }
        for (let i = 0; i < windows.length; i++) {
            let metaWindow = windows[i];
            let outerRect = metaWindow.get_frame_rect();
            let midX = outerRect.x + (outerRect.width / 2);
            let midY = outerRect.y + (outerRect.height / 2);
            if (this.contains(midX, midY)) {
                metaWindow.move_frame(true, this.innerX, this.innerY);
                metaWindow.move_resize_frame(true, this.innerX, this.innerY, this.innerWidth, this.innerHeight);
            }
        }

        if (this.tabs.length < 2) {
            while (this.tabs.length > 0) {
                this.tabs[0].destroy();
            }
            this.tabs = [];
        }

        log("Adjusted zone with " + this.tabs.length + " with window count " + windows.length);
    }

}

export class ZoneTab {
    public window: Window;
    public buttonWidget: StButton;

    constructor(private tabZone: TabbedZone, metaWindow: Window) {
        tabZone.tabs.push(this);
        this.window = metaWindow;
        this.buttonWidget = new St.Button({ style_class: 'tab-button' });
        this.buttonWidget.label = metaWindow.title;
        this.buttonWidget.connect('button-press-event', () => {
            Main.activateWindow(this.window);
        });
        Main.uiGroup.insert_child_above(this.buttonWidget, global.window_group);
    }

    destroy() {
        this.tabZone.tabs.splice(this.tabZone.tabs.indexOf(this), 1);
        this.buttonWidget.visible = false;
        Main.uiGroup.remove_child(this.buttonWidget);
    }
}

export class EditableZone extends Zone {
    private layoutItem: LayoutItem;

    constructor(layoutItem: LayoutItem) {
        // todo
        super();
        this.layoutItem = layoutItem;
    }

    positionChanged() {
        super.positionChanged();
        this.widget.label = `${this.layoutItem.widthPerc}% x ${this.layoutItem.heightPerc}%`;
    }

    sizeChanged() {
        super.sizeChanged();
        this.widget.label = `${this.layoutItem.widthPerc}% x ${this.layoutItem.heightPerc}%`;
    }

    createWidget(styleClass: string = 'grid-preview') {
        this.widget = new St.Button({ style_class: styleClass });
        this.widget.connect('button-press-event', (_actor: ClutterActor, event: any) => {
            var btn = event.get_button();
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
        this.widget;
    }
}

export enum ZoneAnchorType {
    Vertical,
    Horizontal,
};

export class ZoneAnchor {
    private widget: StButton;
    public startX = 0;
    public startY = 0;
    public isMoving: boolean = false;
    public motionConnection = null;

    constructor(
        protected zoneA: ZoneBase,
        protected zoneB: ZoneBase,
        protected type: ZoneAnchorType,
        protected margin: number) {
        this.widget = new St.Button({ style_class: 'size-button' });
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
    windows: Window[];
};

export class ZoneDisplay {
    protected layout: Layout;
    protected margin: number;
    protected motionConnection: any;
    protected workArea: WorkArea | null;
    protected monitor: Monitor;
    protected effectiveZones: Array<ZoneWindows> = new Array<ZoneWindows>();

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
        let [x, y] = global.get_pointer();
        
        log(JSON.stringify(this.effectiveZones.map(zq => zq.zone.innerRect.toString())));
        let newZoneIdx = this.effectiveZones.findIndex(zw => zw.zone.contains(x, y));
        if(newZoneIdx === -1) {
            log("AHIAHIA");
            return;
        }
        
        // remove from old zone
        this.effectiveZones.forEach(zw => {
            const { windows } = zw;
            let idx = windows.findIndex(w => w === win);
            if(idx !== -1) windows.splice(idx, 1);
        });

        // add to new zone
        this.effectiveZones[newZoneIdx].windows.push(win);

        this.applyLayout();
    }

    // Returns the Rect describing the area made by the selected zones found on findX, findY
    // null if findX, findY isn't contained in any zone.
    private getTotalZoneRect(findX: number, findY: number): Rect | null {
        let zones = this.effectiveZones.map(zw => zw.zone)
            .filter(c => c.contains(findX, findY));

        log(`getTotalZone ${zones.length}`);
        if (zones.length == 0)
            return null;

        log(`zones selected: ${zones.length}`);

        let firstZone = zones[0];
        log(`x: ${firstZone.innerX}, y: ${firstZone.innerY}`);

        let lastZone = zones[zones.length - 1];
        let width = lastZone.innerX + lastZone.innerWidth - firstZone.innerX;
        let height = lastZone.innerY + lastZone.innerHeight - firstZone.innerY;
        log(`width: ${width}, height: ${height}`);

        return new Rect(
            new XY(firstZone.innerX, firstZone.innerY),
            new Size(width, height)
        );
    }

    public highlightZonesAtCursor() {
        let [x, y] = global.get_pointer();
        this.effectiveZones.forEach(zw => {
            const { zone } = zw;
            let contained = zone.contains(x, y);
            zone.hover(contained);
        });
    }

    protected createMarginItem() {

    }

    public createZone(x: number = 0, y: number = 0, width: number = 0, height: number = 0): Zone {
        return new Zone(x, y, width, height);
    }

    public init() {
        if (!this.workArea) {
            log(`Could not get workArea for monitor ${this.monitor.index}`);
            return;
        }

        this.effectiveZones = [];

        let x = this.workArea.x + this.margin;
        let y = this.workArea.y + this.margin;

        log(`ZoneDisplay Init: ${JSON.stringify(this.layout)}`);
        for (let index = 0; index < this.layout.items.length; index++) {
            const layoutItem = this.layout.items[index];

            // Create a new zone, starting
            let zone = this.createZone(
                x,
                y,
                (this.workArea.width * layoutItem.widthPerc / 100) - this.margin,
                (this.workArea.height * layoutItem.heightPerc / 100) - this.margin
            );
            this.effectiveZones.push({ zone, windows: []});
            log(`Zone: ${index}: ${zone.innerRect.toString()}`);

            // advance the origin for the next zone
            x += zone.width + (this.margin * 2);
            y += 0;
        }
        log(`Effective zones ${this.effectiveZones.length}`);

        let monitorWindows = getWindowsOfMonitor(this.monitor);
        log(`Layout windows start ${monitorWindows.length}`);
        this.effectiveZones.forEach(zw => {
            const { zone, windows } = zw;
            monitorWindows.forEach(win => {
                let outerRect = win.get_frame_rect();
                let midX = outerRect.x + (outerRect.width / 2);
                let midY = outerRect.y + (outerRect.height / 2);

                log(`${win.get_wm_class()}: ${midX}:${midY}`);
                if (zone.contains(midX, midY)) {
                    log(`Pushing ${win.get_wm_class()} to ${zone.innerRect.toString()}`);
                    windows.push(win);
                }
            });
        });

        log('Layout windows end');
    }

    public applyLayout() {
        this.effectiveZones.forEach(zw => {
            const { zone, windows } = zw;
            zone.adjustWindows(windows);
        });
    };


    public reinit() {
        let wa = getWorkAreaByMonitor(this.monitor);
        if (!this.workArea || !wa) {
            log(`Could not get workArea for monitor ${this.monitor.index}`);
            return;
        }

        if (!areEqual(this.workArea, wa)) {
            this.workArea = wa;
            this.init();
        } else {
            this.applyLayout();
        }
    }

    public hide() {
        this.effectiveZones.forEach(zw => {
            const { zone } = zw;
            zone.hide();
        });
    }

    public show() {
        this.effectiveZones.forEach(zw => {
            const { zone } = zw;
            zone.show();
        });
    }

    public destroy() { }
}

export class ZoneEditor extends ZoneDisplay {
    public stage: StBoxLayout | null = null;
    public motionConnection = null;
    public anchors: ZoneAnchor[];
    public isMoving: boolean = false;


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
            this.highlightZonesAtCursor();
            return true;
        });
    }
}

export class TabbedZoneManager extends ZoneManager {
    constructor(monitor: Monitor, layout: Layout, margin: number) {
        super(monitor, layout, margin);
    }

    public createZone(x: number = 0, y: number = 0, width: number = 0, height: number = 0): Zone {
        return new TabbedZone(x, y, width, height);
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

        let box = new St.BoxLayout({ vertical: true });
        this.contentLayout.add(box);

        this.label = new St.Label({ text: "" });
        box.add(this.label);
        box.add(this.entry = new St.Entry({ text: "" }));
    }
}

export const EntryDialog = GObject.registerClass({
    GTypeName: 'EntryDialogClass',
}, EntryDialogClass
);
