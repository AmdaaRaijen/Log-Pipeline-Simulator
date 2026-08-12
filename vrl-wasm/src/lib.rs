use wasm_bindgen::prelude::*;
use serde_json::Value as JsonValue;
use vrl::compiler::{compile, TimeZone, TargetValueRef};
use vrl::compiler::state::RuntimeState;
use vrl::compiler::runtime::Runtime;
use vrl::value::{Value, Secrets};
use std::collections::BTreeMap;

#[wasm_bindgen]
pub struct VrlResult {
    pub success: bool,
    output: String,
}

#[wasm_bindgen]
impl VrlResult {
    #[wasm_bindgen(getter)]
    pub fn output(&self) -> String {
        self.output.clone()
    }
}

#[wasm_bindgen]
pub fn evaluate_vrl(program_str: &str, input_json: &str) -> VrlResult {
    let parsed: Result<JsonValue, _> = serde_json::from_str(input_json);
    if let Err(e) = parsed {
        return VrlResult { success: false, output: format!("Invalid input JSON: {}", e) };
    }
    
    // Compile
    let functions = vrl::stdlib::all();
    let compile_result = compile(program_str, &functions);
    
    let program = match compile_result {
        Ok(res) => res.program,
        Err(diags) => {
            let formatter = vrl::diagnostic::Formatter::new(program_str, diags);
            return VrlResult { success: false, output: formatter.to_string() };
        }
    };
    
    // Execution Environment
    let mut vrl_val = Value::from(parsed.unwrap());
    let mut metadata = Value::Object(BTreeMap::new());
    let mut secrets = Secrets::new();
    
    // target requires mutable references to value, metadata, and secrets
    let mut target = TargetValueRef {
        value: &mut vrl_val,
        metadata: &mut metadata,
        secrets: &mut secrets,
    };
    
    let state = RuntimeState::default();
    let mut runtime = Runtime::new(state);
    let tz = TimeZone::default();
    
    // Resolve
    match runtime.resolve(&mut target, &program, &tz) {
        Ok(_) => {
            // Target is mutated in place, convert back to JSON
            let out_json = serde_json::to_string(&vrl_val).unwrap();
            VrlResult { success: true, output: out_json }
        },
        Err(e) => {
            VrlResult { success: false, output: format!("error: {}", e) }
        }
    }
}
