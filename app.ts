// GJS import system
declare var imports: any;
declare var global: any;
import {log} from './logging';
import {getCurrentPath} from './utils';
import {ShellVersion} from './shellversion';
import {bind as bindHotkeys, unbind as unbindHotkeys, Bindings} from './hotkeys';
import {ZoneEditor, ZonePreview, TabbedZoneManager, EntryDialog, ZoneManager} from "./editor";

const Gettext = imports.gettext;
const _ = Gettext.gettext;
import {
    Display,
    Window,
    WindowType,
    WorkspaceManager as WorkspaceManagerInterface
} from "./gnometypes";

import {
    activeMonitors,
    getCurrentMonitorIndex
} from './monitors';

import {
    deinitSettings,
    gridSettings,
    initSettings,
} from './settings';

import * as SETTINGS from './settings_data';

import {Layout, LayoutsSettings, WorkspaceMonitorSettings} from './layouts';

/*****************************************************************

 This extension has been developed by micahosborne

 With the help of the gnome-shell community

 Edited by Kvis for gnome 3.8
 Edited by Lundal for gnome 3.18
 Edited by Sergey to add keyboard shortcuts and prefs dialog

 ******************************************************************/

/*****************************************************************
 CONST & VARS
 *****************************************************************/

// Library imports
const Main = imports.ui.main;
const GObject = imports.gi.GObject;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;

// Getter for accesing "get_active_workspace" on GNOME <=2.28 and >= 2.30
const WorkspaceManager: WorkspaceManagerInterface = (
    global.screen || global.workspace_manager);

let launcher: GSnapStatusButtonClass | null;
let enabled = false;
let monitorsChangedConnect: any = false;

const SHELL_VERSION = ShellVersion.defaultVersion();

// Hangouts workaround

const keyBindings: Bindings = new Map([]);

const key_bindings_presets: Bindings = new Map([
    [SETTINGS.PRESET_RESIZE_1, () => {
        globalApp.setLayout(0);
    }],
    [SETTINGS.PRESET_RESIZE_2, () => {
        globalApp.setLayout(1);
    }],
    [SETTINGS.PRESET_RESIZE_3, () => {
        globalApp.setLayout(2);
    }],
    [SETTINGS.PRESET_RESIZE_4, () => {
        globalApp.setLayout(3);
    }],
    [SETTINGS.PRESET_RESIZE_5, () => {
        globalApp.setLayout(4);
    }],
    [SETTINGS.PRESET_RESIZE_6, () => {
        globalApp.setLayout(5);
    }],
    [SETTINGS.PRESET_RESIZE_7, () => {
        globalApp.setLayout(6);
    }],
    [SETTINGS.PRESET_RESIZE_8, () => {
        globalApp.setLayout(7);
    }],
    [SETTINGS.PRESET_RESIZE_9, () => {
        globalApp.setLayout(8);
    }],
    [SETTINGS.PRESET_RESIZE_10, () => {
        globalApp.setLayout(9);
    }],
    [SETTINGS.PRESET_RESIZE_11, () => {
        globalApp.setLayout(10);
    }],
    [SETTINGS.PRESET_RESIZE_12, () => {
        globalApp.setLayout(11);
    }],
    [SETTINGS.PRESET_RESIZE_13, () => {
        globalApp.setLayout(12);
    }],
    [SETTINGS.PRESET_RESIZE_14, () => {

    }],
    [SETTINGS.PRESET_RESIZE_15, () => {

    }],
    [SETTINGS.PRESET_RESIZE_16, () => {

    }],
    [SETTINGS.PRESET_RESIZE_17, () => {

    }],
    [SETTINGS.PRESET_RESIZE_18, () => {

    }],
    [SETTINGS.PRESET_RESIZE_19, () => {

    }],
    [SETTINGS.PRESET_RESIZE_20, () => {

    }],
    [SETTINGS.PRESET_RESIZE_21, () => {

    }],
    [SETTINGS.PRESET_RESIZE_22, () => {

    }],
    [SETTINGS.PRESET_RESIZE_23, () => {

    }],
    [SETTINGS.PRESET_RESIZE_24, () => {

    }],
    [SETTINGS.PRESET_RESIZE_25, () => {

    }],
    [SETTINGS.PRESET_RESIZE_26, () => {

    }],
    [SETTINGS.PRESET_RESIZE_27, () => {

    }],
    [SETTINGS.PRESET_RESIZE_28, () => {

    }],
    [SETTINGS.PRESET_RESIZE_29, () => {

    }],
    [SETTINGS.PRESET_RESIZE_30, () => {

    }],
]);

const keyBindingGlobalResizes: Bindings = new Map([]);

class AppWorkspace {
    public managers: ZoneManager[][] = [];
    public editors: ZoneEditor[] = [];
    public previews: ZonePreview[] = [];
    
    public recreateManagers(tabsEnabled: boolean, margin: number, layoutsSettings: LayoutsSettings) {
        this.getAllManagers()?.forEach(m => m.destroy());
        
        let nWorkspaces = WorkspaceManager.get_n_workspaces();
        let nMonitors = activeMonitors().length;
        log(`Initializing AppWorkspace for ${nWorkspaces} workspaces and ${nMonitors} monitors`);
        this.managers = new Array<ZoneManager[]>(nWorkspaces);
        for (let wI = 0; wI < nWorkspaces; wI++) {
           let layouts = layoutsSettings.workspaces[wI].map(x => layoutsSettings.definitions[x.current]);
           this.recreateWorkspaceManager(wI, tabsEnabled, margin, layouts);
        }
    }
    
    public recreateWorkspaceManager(workspaceIndex: number, tabsEnabled: boolean, margin: number, layouts: Layout[]) {
        let nMonitors = activeMonitors().length;
        this.managers[workspaceIndex]?.forEach(m => m.destroy());
        this.managers[workspaceIndex] = new Array<ZoneManager>(nMonitors);

        for (let mI = 0; mI < nMonitors; mI++) {
            let activeMonitor = activeMonitors()[mI];
            let layout = layouts[mI];

            this.managers[workspaceIndex][mI] = tabsEnabled
                ? new TabbedZoneManager(activeMonitor, layout, margin)
                : new ZoneManager(activeMonitor, layout, margin);
        }
    };

    public getManager(workspaceIndex: number, monitorIndex: number) {
        return this.managers[workspaceIndex][monitorIndex];
    }

    public getAllManagers() {
        return this.managers?.flat();
    }

    public currentWorkspaceManagers() {
        let wI = WorkspaceManager.get_active_workspace().index();
        return this.managers[wI];
    }
    
    public getEditor(monitorIndex: number) {
        return this.editors[monitorIndex];
    }

    public recreateEditors(layout: Layout[], margin: number) {
        this.editors.forEach(e => e.destroy());
        this.editors = new Array<ZoneEditor>(activeMonitors().length);
        
        for (const monitor of activeMonitors()) {
            this.editors[monitor.index] = new ZoneEditor(monitor, layout[monitor.index], margin);
        }
    }

    public recreatePreviews(layout: Layout[], margin: number) {
        this.previews.forEach(e => e.destroy());
        this.previews = new Array<ZonePreview>(activeMonitors().length);

        for (const monitor of activeMonitors()) {
            this.previews[monitor.index] = new ZonePreview(monitor, layout[monitor.index], margin);
        }
    }
}

class App {
    private readonly appWorkspaces: AppWorkspace = new AppWorkspace();

    private currentLayout: Layout;
    public layouts: LayoutsSettings = {
        // [workspaceindex][monitorindex]
        workspaces: [
            [{current: 0}, {current: 0}],
            [{current: 0}, {current: 0}]
        ],
        definitions: [
            {
                name: "2 Column",
                items: [
                    {widthPercentage: 50, heightPercentage: 50},
                    {widthPercentage: 50, heightPercentage: 50},
                ]
            },
        ]
    };

    constructor() {
        this.currentLayout = this.layouts.definitions[0];
    }

    private restackConnection: any;
    private workspaceSwitchedConnect: any;
    private workareasChangedConnect: any;

    setLayout(layoutIndex: number, monitorIndex = getCurrentMonitorIndex()) {
        if (this.layouts.definitions.length <= layoutIndex) {
            return;
        }

        this.currentLayout = this.layouts.definitions[layoutIndex];
        if (this.layouts.workspaces == null) {
            this.layouts.workspaces = [];
        }

        let currentWorkspaceIdx = WorkspaceManager.get_active_workspace().index();

        this.layouts.workspaces[currentWorkspaceIdx][monitorIndex].current = layoutIndex;
        this.saveLayouts();

        let layouts = this.layouts.workspaces[currentWorkspaceIdx].map(x => this.layouts.definitions[x.current]);
        this.appWorkspaces.recreateWorkspaceManager(
            currentWorkspaceIdx,
            gridSettings[SETTINGS.SHOW_TABS],
            gridSettings[SETTINGS.WINDOW_MARGIN],
            layouts
        );
        this.appWorkspaces.getManager(currentWorkspaceIdx, monitorIndex).applyLayout();
        
        let monitorLayouts = this.layouts.workspaces[currentWorkspaceIdx]
            .map( x => this.layouts.definitions[x.current]);
        this.appWorkspaces.recreateEditors(monitorLayouts, gridSettings[SETTINGS.WINDOW_MARGIN]);
        this.appWorkspaces.recreatePreviews(monitorLayouts, gridSettings[SETTINGS.WINDOW_MARGIN]);
        
        this.reloadMenu();
    }

    enable() {
        try {
            let [ok, contents] = GLib.file_get_contents(getCurrentPath()?.replace("/extension.js", "/layouts.json"));
            if (ok) {
                log("Loaded contents " + contents);
                this.layouts = JSON.parse(contents);
                log(JSON.stringify(this.layouts));
                if (this.refreshLayouts()) {
                    this.saveLayouts();
                }
            }
        } catch (exception) {
            log(JSON.stringify(exception));
            let [ok, contents] = GLib.file_get_contents(getCurrentPath()?.replace("/extension.js", "/layouts-default.json"));
            if (ok) {
                this.layouts = JSON.parse(contents);
                this.refreshLayouts();
                this.saveLayouts();
            }
        }

        let showTabs = gridSettings[SETTINGS.SHOW_TABS];
        let margin = gridSettings[SETTINGS.WINDOW_MARGIN];
        this.appWorkspaces.recreateManagers(showTabs, margin, this.layouts);

        this.setToCurrentWorkspace();

        monitorsChangedConnect = Main.layoutManager.connect('monitors-changed', () => {
            log('Evt: monitors-changed');
            this.appWorkspaces.getAllManagers().forEach(m => m.applyLayout());
            this.reloadMenu();
        });

        function validWindow(window: Window): boolean {
            return window != null
                && window.get_window_type() == WindowType.NORMAL;
        }

        global.display.connect('window-created', (_display: Display, win: Window) => {
            log(`Evt: window-created ${win.get_wm_class()} (${win.get_id()})`);
            if (!validWindow(win)) return;

            let monitor = win.get_monitor();
            this.appWorkspaces.currentWorkspaceManagers()[monitor].addWindow(win);
        });

        global.display.connect('in-fullscreen-changed', (_display: Display) => {
            log('Evt: in-fullscreen-changed');
            if (global.display.get_monitor_in_fullscreen(0)) {
                this.appWorkspaces.currentWorkspaceManagers().forEach(m => m.destroy());
            } else {
                this.setToCurrentWorkspace();
            }
        });

        global.display.connect('grab-op-begin', (_display: Display, win: Window) => {
            log('Evt: grab-op-begin');
            if (!validWindow(win)) return;

            this.appWorkspaces.currentWorkspaceManagers().forEach(m => m.show());
        });

        global.display.connect('grab-op-end', (_display: Display, win: Window) => {
            log('Evt: grab-op-end');
            if (!validWindow(win)) return;

            this.appWorkspaces.currentWorkspaceManagers().forEach(m => {
                m.hide();
                m.moveWindowToZoneUnderCursor(win);
            });
        });

        this.restackConnection = global.display.connect('restacked', () => {
            log('Evt: restacked');
            this.appWorkspaces.currentWorkspaceManagers().forEach(m => m.applyLayout());
        });

        this.workspaceSwitchedConnect = WorkspaceManager.connect('workspace-switched', () => {
            log('Evt: workspace-switched');

            if (this.refreshLayouts()) {
                this.saveLayouts();
            }

            this.appWorkspaces.getAllManagers().forEach(m => m.destroy());
            this.setToCurrentWorkspace();
        });

        this.workareasChangedConnect = global.display.connect('workareas-changed', () => {
            log('Evt: workareas-changed');
            this.appWorkspaces.getAllManagers().forEach(m => {
                m.reinit();
                m.applyLayout();
            });
        });

        launcher = new GSnapStatusButton('tiling-icon') as GSnapStatusButtonClass;
        launcher.label = "Layouts";
        if (gridSettings[SETTINGS.SHOW_ICON]) {
            Main.panel.addToStatusArea("GSnapStatusButton", launcher);
            this.reloadMenu();
        }

        bindHotkeys(keyBindings);
        if (gridSettings[SETTINGS.GLOBAL_PRESETS]) {
            bindHotkeys(key_bindings_presets);
        }
        if (gridSettings[SETTINGS.MOVERESIZE_ENABLED]) {
            bindHotkeys(keyBindingGlobalResizes);
        }

        enabled = true;

        log("Extension enable completed");
    }

    refreshLayouts(): boolean {
        let changed = false;

        // A workspace could have been added. Populate the layouts.workspace array
        let nWorkspaces = WorkspaceManager.get_n_workspaces();
        log(`refreshLayouts ${this.layouts.workspaces.length} ${nWorkspaces}`)
        while (this.layouts.workspaces.length < nWorkspaces) {
            let wk = new Array<WorkspaceMonitorSettings>(activeMonitors().length);
            wk.fill({current: 0});
            this.layouts.workspaces.push(wk);
            changed = true;
        }

        return changed;
    }

    reloadMenu() {
        if (launcher == null) return;
        launcher.menu.removeAll();
        let resetLayoutButton = new PopupMenu.PopupMenuItem(_("Reset Layout"));
        let editLayoutButton = new PopupMenu.PopupMenuItem(_("Edit Layout"));
        let saveLayoutButton = new PopupMenu.PopupMenuItem(_("Save Layout"));
        let cancelEditingButton = new PopupMenu.PopupMenuItem(_("Cancel Editing"));
        let newLayoutButton = new PopupMenu.PopupMenuItem(_("Create New Layout"));

        let renameLayoutButton = new PopupMenu.PopupMenuItem(_("Rename: " + this.currentLayout.name));

        let currentMonitorIndex = getCurrentMonitorIndex();
        if (this.appWorkspaces.getEditor(currentMonitorIndex).isEditing) {
            launcher.menu.addMenuItem(resetLayoutButton);
            launcher.menu.addMenuItem(saveLayoutButton);
            launcher.menu.addMenuItem(cancelEditingButton);
        } else {
            const monitorsCount = activeMonitors().length;
            for (let mI = 0; mI < monitorsCount; mI++) {
                if (monitorsCount > 1) {
                    let monitorName = new PopupMenu.PopupSubMenuMenuItem(_(`Monitor ${mI}`));
                    launcher.menu.addMenuItem(monitorName);

                    this.createLayoutMenuItems(mI).forEach(i =>
                        (<any>monitorName).menu.addMenuItem(i));
                } else {
                    this.createLayoutMenuItems(mI).forEach(i =>
                        launcher?.menu.addMenuItem(i));
                }
            }

            let sep = new PopupMenu.PopupSeparatorMenuItem();
            launcher.menu.addMenuItem(sep);
            launcher.menu.addMenuItem(editLayoutButton);
            launcher.menu.addMenuItem(renameLayoutButton);
            launcher.menu.addMenuItem(newLayoutButton);
        }


        renameLayoutButton.connect('activate', () => {
            let dialog = new EntryDialog({
                label: "test"
            });
            dialog.label.text = "Rename Layout " + this.currentLayout.name;
            dialog.entry.text = this.currentLayout.name;
            dialog.onOkay = (text: string) => {
                this.currentLayout.name = text;
                this.saveLayouts();
                this.reloadMenu();
            }
            dialog.open(global.get_current_time());
        });

        newLayoutButton.connect('activate', () => {
            let dialog = new EntryDialog();
            dialog.label.text = "Create New Layout";
            dialog.onOkay = (text: string) => {
                this.layouts.definitions.push({
                    name: text,
                    items: [{widthPercentage: 100, heightPercentage: 100}]
                });
                this.setLayout(this.layouts.definitions.length - 1);
                this.saveLayouts();
                this.reloadMenu();
            }
            dialog.open(global.get_current_time());
        });

        editLayoutButton.connect('activate', () => {
            let currentWorkspace = WorkspaceManager.get_active_workspace();
            let monitorLayouts = this.layouts.workspaces[currentWorkspace.index()]
                .map( x => this.layouts.definitions[x.current]);
            
            this.appWorkspaces.recreateEditors(monitorLayouts, gridSettings[SETTINGS.WINDOW_MARGIN]);

            for (const window of currentWorkspace.list_windows()) {
                window.minimize();
            }

            this.reloadMenu();
        });

        saveLayoutButton.connect('activate', () => {
            this.saveLayouts();
            this.setToCurrentWorkspace();
            this.reloadMenu();
        });

        resetLayoutButton.connect('activate', () => {
            let layouts = activeMonitors().map(_ => ({
                name: "Layout",
                items: [{widthPercentage: 100, heightPercentage: 100}]
            }) as Layout );

            this.appWorkspaces.recreateEditors(layouts, gridSettings[SETTINGS.WINDOW_MARGIN]);
            this.reloadMenu();
        });

        cancelEditingButton.connect('activate', () => {
            this.appWorkspaces.editors.forEach(e => e.destroy());

            let windows = WorkspaceManager.get_active_workspace().list_windows();
            for (let i = 0; i < windows.length; i++) {
                windows[i].unminimize();
            }
            this.reloadMenu();
        });
    }

    createLayoutMenuItems(monitorIndex: number): Array<any> {
        let items = [];
        for (let i = 0; i < this.layouts.definitions.length; i++) {
            let item = new PopupMenu.PopupMenuItem(_(this.layouts.definitions[i].name == null ? "Layout " + i : this.layouts.definitions[i].name));
            item.connect('activate', () => {
                this.setLayout(i, monitorIndex);
                this.appWorkspaces.previews.forEach(p => p.destroy());
            });
            item.actor.connect('enter-event', () => {
                let monitorLayouts = activeMonitors().map(_ => this.layouts.definitions[i]);
                this.appWorkspaces.recreatePreviews(monitorLayouts, gridSettings[SETTINGS.WINDOW_MARGIN]);
                this.appWorkspaces.previews.forEach(p => p.show());
            });
            item.actor.connect('leave-event', () => {
                this.appWorkspaces.previews.forEach(p => p.destroy());
            });
            items.push(item);
        }
        return items;
    }

    saveLayouts() {
        for (const editor of this.appWorkspaces.editors) {
            editor.apply();
            editor.destroy();
        }

        GLib.file_set_contents(getCurrentPath()?.replace("/extension.js", "/layouts.json"), JSON.stringify(this.layouts));
        log(JSON.stringify(this.layouts));

        let windows = WorkspaceManager.get_active_workspace().list_windows();
        for (let i = 0; i < windows.length; i++) {
            windows[i].unminimize();
        }
    }

    disable() {
        log("Extension disable begin");
        enabled = false;
        this.appWorkspaces.previews.forEach(p => p.destroy());
        this.appWorkspaces.editors.forEach(p => p.destroy());
        this.appWorkspaces.getAllManagers().forEach(p => p.destroy());

        if (this.workspaceSwitchedConnect) {
            WorkspaceManager.disconnect(this.workspaceSwitchedConnect);
            this.workspaceSwitchedConnect = false;
        }
        if (this.restackConnection) {
            global.display.disconnect(this.restackConnection);
            this.restackConnection = false;
        }
        if (monitorsChangedConnect) {
            log("Disconnecting monitors-changed");
            Main.layoutManager.disconnect(monitorsChangedConnect);
            monitorsChangedConnect = false;
        }

        if (this.workareasChangedConnect) {
            global.display.disconnect(this.workareasChangedConnect);
            this.workareasChangedConnect = false;
        }

        unbindHotkeys(keyBindings);
        unbindHotkeys(key_bindings_presets);
        unbindHotkeys(keyBindingGlobalResizes);

        launcher?.destroy();
        launcher = null;
    }


    /**
     * onFocus is called when the global focus changes.
     */
    onFocus() {
    }

    showMenu() {
    }

    private setToCurrentWorkspace() {
        let currentWorkspaceIdx = WorkspaceManager.get_active_workspace().index();
        this.appWorkspaces.currentWorkspaceManagers().forEach((manager, index) =>
        {
            let currentLayoutIdx = this.layouts.workspaces[currentWorkspaceIdx][index].current;
            this.setLayout(currentLayoutIdx, index);
        });
        
        let monitorLayouts = this.layouts.workspaces[currentWorkspaceIdx]
            .map( x => this.layouts.definitions[x.current]);
        this.appWorkspaces.recreateEditors(monitorLayouts, gridSettings[SETTINGS.WINDOW_MARGIN]);
        this.appWorkspaces.recreatePreviews(monitorLayouts, gridSettings[SETTINGS.WINDOW_MARGIN]);
    }
}

const globalApp = new App();

class GSnapStatusButtonClass extends PanelMenu.Button {
    _init(classname: string) {
        super._init(0.0, "gSnap", false);

        //Done by default in PanelMenuButton - Just need to override the method
        if (SHELL_VERSION.version_at_least_34()) {
            this.add_style_class_name(classname);
            this.connect('button-press-event', this._onButtonPress);
        } else {
            this.actor.add_style_class_name(classname);
            this.actor.connect('button-press-event', this._onButtonPress);
        }
        log("GSnapStatusButton _init done");
    }

    reset() {
        this.activated = false;
        if (SHELL_VERSION.version_at_least_34()) {
            this.remove_style_pseudo_class('activate');
        } else {
            this.actor.remove_style_pseudo_class('activate');
        }
    }

    activate() {
        if (SHELL_VERSION.version_at_least_34()) {
            this.add_style_pseudo_class('activate');
        } else {
            this.actor.add_style_pseudo_class('activate');
        }
    }

    deactivate() {
        if (SHELL_VERSION.version_at_least_34()) {
            this.remove_style_pseudo_class('activate');
        } else {
            this.actor.remove_style_pseudo_class('activate');
        }
    }

    _onButtonPress(_actor: any, _event: any) {
        log(`_onButtonPress Click Toggle Status on system panel ${this}`);
        globalApp.showMenu();
    }

    _destroy() {
        this.activated = null;
    }
}

const GSnapStatusButton = GObject.registerClass({
        GTypeName: 'GSnapStatusButton',
    }, GSnapStatusButtonClass
);

function changed_settings() {
    log("changed_settings");
    if (enabled) {
        disable();
        enable();
    }
    log("changed_settings complete");
}

export function enable() {
    initSettings(changed_settings);
    log("Extension enable begin");
    SHELL_VERSION.print_version();

    globalApp.enable();
}

export function disable() {
    deinitSettings();
    globalApp.disable();
}
