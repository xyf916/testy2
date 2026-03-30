# FR Reference Detector

Simple VSCode extension: hover over FR references to preview Word documents.

## Features

1. **Hover** - See title, status, preview
2. **Click link** - Open full document in side panel

## Setup

```bash
# Python dependency
pip install python-docx

# VSCode extension
npm install
npm run compile
```

## Configuration

```json
{
    "frDetector.frDirectory": "C:\\FaultReports",
    "frDetector.pythonPath": "python",
    "frDetector.previewLimit": 200
}
```

## Files

```
fr-reference-detector/
├── fr_parser.py      # Python: parses Word docs
├── src/extension.ts  # TypeScript: VSCode extension
├── package.json
└── requirements.txt
```

Press F5 in VSCode to test.
