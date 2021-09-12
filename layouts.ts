export interface WorkspaceMonitorSettings {
    current: number
};

export interface ZoneDefinition {
    length: number,
    items?: ZoneDefinition[]
};

export interface LayoutDefinition {
    type: number,
    name: string,
    length: number,
    items: ZoneDefinition[]
};

export interface Layouts {
    workspaces: WorkspaceMonitorSettings[][],
    definitions: LayoutDefinition[]
};