export interface WorkspaceMonitorSettings {
    current: number
};

export interface LayoutItem {
    // width and height of the LayoutItem in percentage of the available screen
    widthPerc: number,
    heightPerc: number,
};

export interface Layout {
    name: string,
    items: LayoutItem[],
};

export interface LayoutsSettings {
    workspaces: WorkspaceMonitorSettings[][],
    definitions: Layout[]
};