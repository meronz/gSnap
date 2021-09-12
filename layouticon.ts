import { LayoutDefinition } from "./layouts";

export class LayoutIcon {
    w: number;
    h: number;

    constructor(w = 16, h = 16) {
        this.w = w;
        this.h = h;
    }

    renderSvg(layout: LayoutDefinition) : string {
        let content = "";
        let xOffset = 0;
        layout.items.forEach(horizontal => {
            content += `<rect x="${xOffset}%" y="0%" width="${horizontal.length}%" height="100%" style="fill:rgb(190,190,190);stroke-width:1;stroke:rgb(0,0,0)"/>`;

            if (horizontal.items) {
                let yOffset = 0;
                horizontal.items.forEach(vertical => {
                    content += `<rect x="${xOffset}%" y="${yOffset}%" width="${horizontal.length}%" height="${vertical.length}%" style="fill:rgb(190,190,190);stroke-width:1;stroke:rgb(0,0,0)"/>`
                    yOffset += vertical.length;
                });
            }

            xOffset += horizontal.length;
        });

        return `<svg width="${this.w}" height="${this.h}">` +
            `<rect width="100%" height="100%" style="fill:rgb(190,190,190);stroke-width:2;stroke:rgb(0,0,0)"/>` +
            content +
            `</svg>`
    }
}