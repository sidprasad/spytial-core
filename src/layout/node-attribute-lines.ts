import type { LayoutNode } from './interfaces';
import type { TextStyle } from './style/text-style';

type NodeAttributes = Pick<LayoutNode, 'attributes' | 'attributeTextStyles' | 'tagAttributeOffsets'>;

export interface NodeAttributeLine {
    key: string;
    values: string[];
    separator: string;
    textStyle?: TextStyle;
}

export function getNodeAttributeLines(node: NodeAttributes): NodeAttributeLine[] {
    return Object.entries(node.attributes ?? {}).flatMap(([key, values]) => {
        const textStyle = node.attributeTextStyles?.[key];
        const attribute = { key, values, textStyle, separator: ': ' };
        const tagOffset = node.tagAttributeOffsets?.[key];
        if (typeof tagOffset !== 'number' || tagOffset >= values.length) return [attribute];

        const tag = { key, values: values.slice(tagOffset), textStyle, separator: key ? ' ' : '' };
        return tagOffset === 0 ? [tag] : [{ ...attribute, values: values.slice(0, tagOffset) }, tag];
    });
}

export function formatNodeAttributeLine(line: NodeAttributeLine, valueSeparator = ', '): string {
    return `${line.key}${line.separator}${line.values.join(valueSeparator)}`;
}
