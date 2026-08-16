import { DOMParser } from '@xmldom/xmldom';

// forge-expr-evaluator ships a CJS bundle whose API lands on the namespace
// when bundled but on `.default` in plain Node — pick whichever side has it
// (see sgq-evaluator.ts for the long form). The class is aliased in type
// space; everything else is type-only and erased at compile time.
import * as forgeExprEvaluatorNamespace from 'forge-expr-evaluator';
import type { ForgeExprEvaluatorUtil as ForgeExprEvaluatorUtilType, EvaluationResult, ErrorResult } from 'forge-expr-evaluator';
const forgeExprEvaluator: any = (forgeExprEvaluatorNamespace as any).ForgeExprEvaluatorUtil
  ? forgeExprEvaluatorNamespace
  : (forgeExprEvaluatorNamespace as any).default;
const { ForgeExprEvaluatorUtil } = forgeExprEvaluator;
import { AlloyDatum, AlloyRelation, parseAlloyXML, AlloyTuple, AlloyInstance, AlloyType } from '../../data-instance/alloy/alloy-instance';
import type { DatumParsed, ParsedValue, Relation, Sig, InstanceData, ForgeTuple, BuiltinType } from 'forge-expr-evaluator/dist/types';
import IEvaluator, {
  EvaluationContext,
  EvaluatorConfig,
  IEvaluatorResult
} from '../../evaluator-contracts';
import { BaseEvaluatorResult } from './base-evaluator-result';



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

export class ForgeEvaluatorResult extends BaseEvaluatorResult {
    constructor(result: EvaluationResult, expr: string) {
        super(result, expr, isErrorResult(result));
    }
}

export class ForgeEvaluator implements IEvaluator {
    private context?: EvaluationContext;
    private evaluator?: ForgeExprEvaluatorUtilType;
    private sourceCode: string = '';
    private initialized: boolean = false;
    // Cache for evaluator results - lifetime tied to this evaluator instance
    private evaluatorCache: Map<string, IEvaluatorResult> = new Map();

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
            
            // Clear cache on initialization
            this.evaluatorCache.clear();
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

            // Create cache key using JSON.stringify for robustness
            const cacheKey = JSON.stringify({ expression, instanceIndex });
            
            // Check cache first
            if (this.evaluatorCache.has(cacheKey)) {
                return this.evaluatorCache.get(cacheKey)!;
            }

            console.log("Evaluator", this.evaluator);

            const result: EvaluationResult = this.evaluator!.evaluateExpression(expression, instanceIndex);

            if (isErrorResult(result)) {
                throw new Error(result.error.message);
            }
            console.log(`Evaluated expression: ${expression} at ${config} with result:`, result);
            
            const wrappedResult = new ForgeEvaluatorResult(result, expression);
            
            // Store in cache
            this.evaluatorCache.set(cacheKey, wrappedResult);
            
            return wrappedResult;
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




    /**
     * Disposes of resources and clears caches to help with garbage collection.
     * Should be called when the evaluator is no longer needed.
     */
    dispose(): void {
        // Clear the evaluator cache which can hold many result objects
        this.evaluatorCache.clear();
        
        this.context = undefined;
        this.evaluator = undefined;
        this.sourceCode = '';
        this.initialized = false;
        
        // Clear the data instance reference
        //this.alloyDatum = null as any;
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

    /**
     * Returns memory usage statistics for this evaluator.
     * Useful for monitoring and debugging memory consumption.
     * 
     * @returns Object containing memory-related metrics
     */
    public getMemoryStats(): {
        cacheSize: number;
        hasAlloyDatum: boolean;
    } {
        return {
            cacheSize: this.evaluatorCache.size,
            hasAlloyDatum: false
        };
    }
}

// Backward compatibility alias
export const WrappedForgeEvaluator = ForgeEvaluator;
export const WrappedEvalResult = ForgeEvaluatorResult;


