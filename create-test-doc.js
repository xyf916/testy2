const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const fs = require('fs');
const path = require('path');

async function createTestDocument() {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: "FR222 - User Authentication Module",
                    heading: HeadingLevel.TITLE,
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Status: ", bold: true }),
                        new TextRun("Active"),
                    ],
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "Description",
                    heading: HeadingLevel.HEADING_1,
                }),
                new Paragraph({
                    text: "This functional requirement defines the user authentication module for the system. The module shall provide secure login functionality using industry-standard encryption protocols. Users must be authenticated before accessing any protected resources within the application.",
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "Requirements",
                    heading: HeadingLevel.HEADING_1,
                }),
                new Paragraph({ text: "1. The system shall support username/password authentication." }),
                new Paragraph({ text: "2. Passwords must be hashed using SHA-256 or stronger algorithms." }),
                new Paragraph({ text: "3. Failed login attempts shall be logged for security auditing." }),
                new Paragraph({ text: "4. Session timeout shall be configurable (default: 30 minutes)." }),
                new Paragraph({ text: "5. Multi-factor authentication support shall be available as an option." }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    text: "Implementation Notes",
                    heading: HeadingLevel.HEADING_1,
                }),
                new Paragraph({
                    text: "The authentication module interfaces with the central user database through the UserService API. All authentication tokens are JWT-based with configurable expiration times. See FR100 for related security requirements and FR250 for session management details.",
                }),
            ],
        }],
    });

    const outputDir = path.join(__dirname, '..', 'FR', 'FR200s');
    fs.mkdirSync(outputDir, { recursive: true });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(outputDir, 'FR222.docx'), buffer);
    
    console.log('FR222.docx created successfully in FR/FR200s/');
}

createTestDocument().catch(console.error);
