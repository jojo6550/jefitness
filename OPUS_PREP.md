# How to Use Claude Opus for Documentation

## Step 1: Gather All Source Files

Run this command to create a bundled file of your entire codebase:

```bash
# From your jefitness root directory
cat CLAUDE.md > /tmp/codebase_bundle.txt && \
echo -e "\n\n---\n\n## BACKEND FILES\n" >> /tmp/codebase_bundle.txt && \
find src -type f -name "*.js" | sort | while read f; do echo -e "\n### $f\n\`\`\`javascript" >> /tmp/codebase_bundle.txt && cat "$f" >> /tmp/codebase_bundle.txt && echo -e "\n\`\`\`" >> /tmp/codebase_bundle.txt; done && \
echo -e "\n\n---\n\n## FRONTEND FILES\n" >> /tmp/codebase_bundle.txt && \
find public/js -type f -name "*.js" | sort | while read f; do echo -e "\n### $f\n\`\`\`javascript" >> /tmp/codebase_bundle.txt && cat "$f" >> /tmp/codebase_bundle.txt && echo -e "\n\`\`\`" >> /tmp/codebase_bundle.txt; done && \
echo "Bundle created at /tmp/codebase_bundle.txt"
```

This creates a single file with all your source code organized by section.

## Step 2: Go to Claude Opus (claude.ai or Claude Code)

1. Switch to **Claude Opus 4.6** model (if using Claude Code, use `/fast` for fastest inference, or select Opus explicitly)
2. Go to a new conversation

## Step 3: Copy & Paste Your Request

**Option A: Feed everything at once (preferred for Opus)**
1. Copy the entire content of `/tmp/codebase_bundle.txt`
2. Paste it into the conversation
3. Then paste the `DOCUMENTATION_REQUEST.md` content
4. Ask: "Create comprehensive codebase documentation following the structure in DOCUMENTATION_REQUEST.md"

**Option B: Upload as file (if Claude Code supports file upload)**
1. Create `CODEBASE_BUNDLE.txt` from the bundle
2. Upload it to Claude
3. Provide the DOCUMENTATION_REQUEST.md separately

## Step 4: Review & Organize Output

Opus will generate a large markdown file (likely 50k+ words). 

Options for organizing output:
- **Single file**: Save as `DOCUMENTATION.md` in your repo root
- **Split files**: Ask Opus to output in sections (Architecture.md, Backend.md, Frontend.md, etc.)
- **Interactive refinement**: Ask follow-up questions to drill into specific areas

## Token Budget Estimate

- **Input**: 40–50k tokens (all source files + request)
- **Output**: 80–150k tokens (comprehensive docs)
- **Total**: 120–200k tokens for Opus

**Cost**: ~$3–5 depending on your token usage with Opus 4.6

---

## What to Expect

Opus will:
✅ Read and understand your entire codebase  
✅ Create comprehensive file-by-file documentation  
✅ Generate user flow diagrams (ASCII)  
✅ Document every function with parameters, return values, and examples  
✅ Explain architecture and integration points  
✅ Include security analysis  
✅ Provide API endpoint reference  

---

## After You Get the Docs

Save the output as `DOCUMENTATION.md` in your repo root and:
1. Review for accuracy (especially function signatures)
2. Add any missing context or business logic explanations
3. Commit to git for future reference
4. Use as basis for onboarding or code generation prompts

---

## Pro Tips

- **Don't** include node_modules, build files, or test files in the bundle
- **Do** include `.env.example` if you have configuration docs
- **Consider** asking Opus to organize output into numbered sections for easy navigation
- **Use** the documentation as a reference when writing future Claude prompts (cite specific sections)
