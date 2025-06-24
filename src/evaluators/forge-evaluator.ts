import { DOMParser } from '@xmldom/xmldom';

import { ForgeExprEvaluatorUtil, EvaluationResult, ErrorResult } from 'forge-expr-evaluator';
import { AlloyDatum, AlloyRelation, parseAlloyXML, AlloyTuple, AlloyInstance, AlloyType } from '../data-instance/alloy/alloy-instance';
import { DatumParsed, ParsedValue, Relation, Sig, InstanceData, ForgeTuple, BuiltinType } from 'forge-expr-evaluator/dist/types';
import { SingleValue, Tuple } from 'forge-expr-evaluator/dist/ForgeExprEvaluator';
import IEvaluator, { 
  EvaluationContext, 
  EvaluatorConfig, 
  IEvaluatorResult, 
  EvaluatorResult as IEvaluatorResultType 
} from './interfaces';



function toForgeType(type: AlloyType): Sig | BuiltinType {


    let meta = type.meta && type.meta?.builtin ? {
        builtin: type.meta.builtin
    } : undefined

    return {
        _: type._,
        id: type.id,
        types: type.types,
        atoms: type.atoms,
        meta: meta
    };

}

function toForgeTuple(tuple: AlloyTuple): ForgeTuple {
    return {
        _: tuple._,
        types: tuple.types,
        atoms: tuple.atoms
    };
}

function toRelation(r: AlloyRelation): Relation {

    return {
        _: r._,
        id: r.id,
        name: r.name,
        types: r.types,
        tuples: r.tuples.map((tuple) => toForgeTuple(tuple))
    };

}

function toInstanceData(id: AlloyInstance): InstanceData {

    let alloyRelations = id.relations;
    let alloySkolems = id.skolems;
    let alloyTypes = id.types;

    let forgeRelations: Record<string, Relation> = {};
    for (let key in alloyRelations) {
        forgeRelations[key] = toRelation(alloyRelations[key]);
    }

    let forgeTypes: {
        "seq/Int": BuiltinType;
        Int: BuiltinType;
        univ: BuiltinType;
        [key: string]: Sig;
    } = {
        "seq/Int": toForgeType(alloyTypes["seq/Int"]) as BuiltinType,
        Int: toForgeType(alloyTypes["Int"]) as BuiltinType,
        univ: toForgeType(alloyTypes["univ"]) as BuiltinType,
    };

    // Dynamically add other keys from alloyTypes
    for (let key in alloyTypes) {
        if (key !== "seq/Int" && key !== "Int" && key !== "univ") {
            forgeTypes[key] = toForgeType(alloyTypes[key]);
        }
    }

    // We have to ensure some things here!

    return {
        types: forgeTypes,
        relations: forgeRelations,
        skolems: alloySkolems
    };

}


function toParsedValue(ad: AlloyDatum): ParsedValue {

    // export interface AlloyDatum {
    //   instances: AlloyInstance[];
    //   bitwidth?: number;
    //   command?: string;
    //   loopBack?: number;
    //   maxSeq?: number;
    //   maxTrace?: number;
    //   minTrace?: number;
    //   traceLength?: number;
    //   visualizerConfig?: VisualizerConfig;
    // }

    // export interface ParsedValue {
    //     instances: InstanceData[];
    //     bitwidth: number;
    //     [key: string]: any;
    // }

    // Convert the AlloyDatum to a ParsedValue object
    let parsedValue: ParsedValue = {
        instances: ad.instances.map((instance) => toInstanceData(instance)),
        bitwidth: ad.bitwidth || 0
        // Maybe more?

    };

    return parsedValue;


}

function alloyXMLToDatumParsed(datum: string): DatumParsed {
    let ad: AlloyDatum = parseAlloyXML(datum);
    let parsedValue: ParsedValue = toParsedValue(ad);

    return {
        parsed: parsedValue,
        data: datum
    };
}

function isErrorResult(result: EvaluationResult): result is ErrorResult {
    return (result as ErrorResult).error !== undefined;
}

// export type SingleValue = string | number | boolean;
// export type Tuple = SingleValue[];
// export type EvalResult = SingleValue | Tuple[];
function isSingleValue(value: unknown): value is SingleValue {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}


function singleValueToString(value: SingleValue): string {
    if (typeof value === "string") {
        return value;
    } else if (typeof value === "number") {
        return value.toString();
    } else if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    throw new Error("Invalid SingleValue type");
}

export class ForgeEvaluatorResult implements IEvaluatorResult {
    private result: EvaluationResult;
    private isErrorResult: boolean = false;
    private isSingletonResult: boolean = false;
    private expr: string;

    constructor(result: EvaluationResult, expr: string) {
        this.result = result;
        this.expr = expr;
        this.isErrorResult = isErrorResult(result);
        this.isSingletonResult = isSingleValue(result);
    }

    isError(): boolean {
        return this.isErrorResult;
    }

    isSingleton(): boolean {
        return this.isSingletonResult;
    }

    getExpression(): string {
        return this.expr;
    }

    getRawResult(): IEvaluatorResultType {
        if (this.isErrorResult) {
            const errorResult = this.result as ErrorResult;
            return {
                error: {
                    message: errorResult.error.message,
                    code: 'FORGE_ERROR'
                }
            };
        }
        
        if (this.isSingletonResult) {
            return this.result as SingleValue;
        }
        
        return this.result as Tuple[];
    }

    prettyPrint(): string {
        if (typeof this.result === 'string') {
            return this.result;
        } 
        else if (typeof this.result === 'number') {
            return this.result.toString();
        }
        else if (typeof this.result === 'boolean') {
            return this.result ? "true" : "false";
        }
        else if (this.isErrorResult) {
            let errorResult = this.result as ErrorResult;
            return `Error: ${errorResult.error.message}`;
        }
        else {
            let tupleStringArray: string[] = [];
            let asTuple = this.result as Tuple[];

            // For each tuple in the result, join the elements with a ->
            for (let i = 0; i < asTuple.length; i++) {
                let tuple = asTuple[i];
                let tupleString = tuple.join("->");
                tupleStringArray.push(tupleString);
            }
            // Now join the tuplesStringArray with " , "
            let resultString = tupleStringArray.join(" , ");
            return resultString;
        }
    }

    singleResult(): SingleValue {
        if (!this.isSingletonResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to a single value. Instead:${pp}`);
        }
        return this.result as SingleValue;
    }

    selectedAtoms(): string[] {
        if (this.isSingletonResult || this.isErrorResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 1. Instead: ${pp}`);   
        }

        let asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 0);
        if (selectedElements.length === 0) {
            return [];
        }

        // Now ensure that all selected elements are of arity 1
        selectedElements = selectedElements.filter((element) => element.length === 1);
        /// ... ///

        // Flatten the selected elements
        let flattened = selectedElements.flat().map((element) => singleValueToString(element));

        // Now dedupe the elements
        let uniqueElements = Array.from(new Set(flattened));
        return uniqueElements;
    }

    selectedTwoples(): string[][] {
        if (this.isSingletonResult || this.isErrorResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${pp}`);   
        }

        // NO ATOMS
        let asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 1);
        if (selectedElements.length === 0) {
            return [];
        }

        // Now get the FIRST AND LAST elements of the selected elements
        let selectedTuples = selectedElements.map((element) => {
            return [element[0], element[element.length - 1]];
        }).map((element) => {
            return element.map((e) => singleValueToString(e));
        });
        return selectedTuples;
    }

    selectedTuplesAll(): string[][] {
        if (this.isSingletonResult || this.isErrorResult) {
            let pp = this.prettyPrint();
            throw new Error(`Expected selector ${this.expr} to evaluate to values of arity 2. Instead:${pp}`);   
        }

        // NO ATOMS
        let asTuple = this.result as Tuple[];

        let selectedElements = asTuple.filter((element) => element.length > 1);
        if (selectedElements.length === 0) {
            return [];
        }

        let selectedTuples = selectedElements.map((element) => {
            return element.map((e) => singleValueToString(e));
        });
        return selectedTuples;
    }
}

export class ForgeEvaluator implements IEvaluator {
    private context?: EvaluationContext;
    private evaluator?: ForgeExprEvaluatorUtil;
    private sourceCode: string = '';
    private initialized: boolean = false;

    initialize(context: EvaluationContext): void {
        this.context = context;
        
        try {
            // Parse the XML data
            const datumAsXML = typeof context.sourceData === 'string' 
                ? context.sourceData 
                : JSON.stringify(context.sourceData);
            
            // Parse for validation but don't store
            parseAlloyXML(datumAsXML);
            const datumParsed: DatumParsed = alloyXMLToDatumParsed(datumAsXML);
            
            // Extract source code from context or XML
            this.sourceCode = context.sourceCode || ForgeEvaluator.getSourceCodeFromDatum(datumAsXML);
            
            // Initialize the forge evaluator
            this.evaluator = new ForgeExprEvaluatorUtil(datumParsed, this.sourceCode);
            this.initialized = true;
        } catch (error) {
            this.initialized = false;
            throw new Error(`Failed to initialize ForgeEvaluator: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    isReady(): boolean {
        return this.initialized && this.evaluator !== undefined;
    }

    evaluate(expression: string, config?: EvaluatorConfig): IEvaluatorResult {
        if (!this.isReady()) {
            throw new Error('ForgeEvaluator is not properly initialized');
        }



        
        if (!this.sourceCode) {
           // throw new Error('No source code available for evaluation');
           console.log('No source code available for evaluation, proceeding without it');
           this.sourceCode = ''; // Ensure sourceCode is defined
        }

        try {
            const instanceIndex = config?.instanceIndex ?? 0;
            const result: EvaluationResult = this.evaluator!.evaluateExpression(expression, instanceIndex);

            if (isErrorResult(result)) {
                throw new Error(result.error.message);
            }
            console.log(`Evaluated expression: ${expression} at ${config} with result:`, result);
            return new ForgeEvaluatorResult(result, expression);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Create a forge-compatible error result
            const forgeError = new Error(`Error evaluating Forge expression: ${expression}. ${errorMessage}`);
            const errorResult: ErrorResult = {
                error: forgeError
            };
            return new ForgeEvaluatorResult(errorResult, expression);
        }
    }

    validateExpression(expression: string): boolean {
        if (!this.isReady()) {
            return false;
        }

        try {
            // Basic validation - check if expression is non-empty and doesn't contain obvious syntax errors
            if (!expression || expression.trim().length === 0) {
                return false;
            }
            
            // Could add more sophisticated validation here using forge parser
            // For now, just basic checks
            return !expression.includes('INVALID_SYNTAX');
        } catch {
            return false;
        }
    }




    dispose(): void {
        this.context = undefined;
        this.evaluator = undefined;
        this.sourceCode = '';
        this.initialized = false;
    }


    static getSourceCodeFromDatum(datum: string): string {
        try {
            const xmlParser = new DOMParser();
            const xmlDoc = xmlParser.parseFromString(datum, "application/xml");

            const sourceElement = xmlDoc.getElementsByTagName("source")[0];
            if (!sourceElement) {
                console.warn("No <source> element found in XML");
                return "";
            }

            const content = sourceElement.getAttribute("content") || "";
            if (!content) {
                console.warn("No content attribute found in <source> element");
            }

            return content;
        } catch (error) {
            console.error("Error extracting source code from datum:", error);
            return "";
        }
    }
}

// Backward compatibility alias
export const WrappedForgeEvaluator = ForgeEvaluator;
export const WrappedEvalResult = ForgeEvaluatorResult;


