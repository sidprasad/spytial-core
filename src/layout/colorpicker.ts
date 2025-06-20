/**
 * 
 * Implementation of the Phyllotactic Color-Picking Algorithm
 * that is CIELAB informed.
 * 
 */

import chroma from 'chroma-js';

export class ColorPicker {
    private colors: string[];
    private index: number;

    constructor(totalColors: number) {
        this.colors = this.generateColors(totalColors);
        this.index = 0;
    }

    // Generate a specified number of colors using the Phyllotactic Color-Picking Algorithm
    private generateColors(totalColors: number): string[] {
        const colors: string[] = [];
        for (let i = 0; i < totalColors; i++) {
            colors.push(this.phyllotacticColor(i));
        }
        return colors;
    }

    // Get the next color in the sequence
    public getNextColor(): string {
        if (this.index >= this.colors.length) {
            this.index = 0; // Reset index if it exceeds the number of colors
        }
        return this.colors[this.index++];
    }

    // Phyllotactic Color-Picking Algorithm using CIELAB color space
    private phyllotacticColor(index: number): string {
        const goldenAngle = 137.5 * (Math.PI / 180); // Convert to radians
        const radius = 100; // Radius of the circle
        const angle = index * goldenAngle;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);

        // Convert the position to a color in the CIELAB color space
        const l = 50; // Lightness
        const a = x; // Position on the a* axis
        const b = y; // Position on the b* axis

        // Convert CIELAB to RGB using chroma.js
        const color = chroma.lab(l, a, b).rgb();


        // Apply a factor to darken the colors
        const darkFactor = 1; // Adjust this factor to make the colors darker
        const darkR = Math.round(color[0] * darkFactor);
        const darkG = Math.round(color[1] * darkFactor);
        const darkB = Math.round(color[2] * darkFactor);

        return `rgb(${darkR}, ${darkG}, ${darkB})`;
    }
}

