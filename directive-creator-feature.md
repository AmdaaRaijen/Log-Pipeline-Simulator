# Talos Custom Directive Creator

The **Talos Custom Directive Creator** is an integrated feature in the DSIEM Pipeline Simulator designed to help L2 Security Analysts smoothly construct and manage custom DSIEM directives. By following a step-by-step wizard, users can ensure all required artifacts for custom directives are generated correctly, without manual, error-prone file composition.

This tool exclusively supports **Vector** based log pipelines.

## Goal and Concept

When introducing a new DSIEM detection logic, analysts typically need to construct several configuration files and map them correctly across the backend and log-parsing layers. 

The primary goals of this tool are:
1. **Reduce Friction**: Guide the user through a 5-step wizard to assemble a complete set of directive configurations.
2. **Eliminate Syntax Errors**: Provide real-time generation and preview for YAML configurations, JSON directives, and VRL scripts.
3. **Enhance Extensibility**: Allow users to import and expand upon existing Use Cases automatically.
4. **AI-Assisted VRL**: Automatically generate and append VRL syntax using an LLM based on simple English descriptions, and test the VRL against raw logs directly in the browser.

## Step-by-Step Workflow

### 1. Project Setup (Step 0)
The setup phase captures the foundational parameters:
- **Group Name**: The directive's group identifier (e.g., `secdev`, `imperva`).
- **Plugin ID**: The overarching plugin base ID (e.g., `45572`). Directive IDs will be mathematically derived from this ID.
- **Index Name**: The name of the Elasticsearch / OpenSearch index where the logs reside.
- **Custom Usecase Toggle**: An option indicating whether the log source requires a custom `60_custom-filter.vrl` script. If the source already has one in production, you can import the existing `.tsv` and `.vrl` here to continue developing from where you left off.

### 2. Usecase Table (Step 1)
Here, users manage the specific Use Cases (SIDs) tied to the `Plugin ID`.
- Users map `sid` to a specific **Title**, **MITRE Tactic**, and **MITRE Kingdom**.
- The `Title` field strictly determines the lookup key against the parsed log (`.rule.name` or `.usecase.title_name`).
- Auto-imported TSVs from Step 0 will populate here automatically.

### 3. YAML Configuration (Step 2)
Configures the Vector lookup logic (`70_dsiem-plugin_{group}.yaml`).
- Defines how Vector parses the raw fields to enrich the logs with DSIEM's `plugin_id` and `plugin_sid`.
- Supports configuring up to 3 custom data fields (e.g., mapping `.action` to a custom DSIEM label).
- A real-time YAML preview is displayed alongside the form.

### 4. Custom VRL Filter (Step 3) 
*This step is only accessible if "Custom Usecase" is enabled in Step 0.*
- An integrated IDE-like environment to construct `60_custom-filter_{group}.vrl`.
- **AI Auto-Generate**: Describe the use case in plain text (e.g., *"Detects multiple failed login attempts"*). The LLM will generate the precise VRL condition block and automatically append it to the editor.
- **Test VRL**: Test the current VRL script against a sample raw log. The resulting JSON object will pop up in a modal, displaying a **✓ Rule Match** badge if the rule successfully tagged a `usecase`, or a **⚠ No Rule Match** badge otherwise.

### 5. Review & Export (Step 4)
Provides a final consolidated view of all generated files:
1. `{group}_plugin-sids.tsv`
2. `directives_dsiem-backend-0_{group}.json`
3. `70_dsiem-plugin_{group}.yaml`
4. `60_custom-filter_{group}.vrl` (Optional)

The tool includes a handy **Deployment Checklist** illustrating exactly where each file must be copied to within the Kubernetes cluster, reducing deployment errors. You can also click **Save Project** to persist your progress locally.
