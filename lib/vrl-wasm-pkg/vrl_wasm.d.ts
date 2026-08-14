/* tslint:disable */
/* eslint-disable */

export class VrlResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    success: boolean;
    readonly output: string;
}

export function evaluate_vrl(program_str: string, input_json: string): VrlResult;
