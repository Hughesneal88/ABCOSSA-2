import os
import csv
import json
from playwright.sync_api import sync_playwright

NOMINEES_DATA = [
    {
        "category": "Student of the Year",
        "description": "Recognizing outstanding academic excellence, leadership, and community service.",
        "nominees": [
            {
                "code": "101",
                "name": "Ama Serwaa",
                "department": "Biochemistry",
                "level": "Level 400",
                "votes": 42,
                "bio": "Dean's Honor Roll recipient, peer tutor, and lead student organizer for regional science outreach."
            },
            {
                "code": "102",
                "name": "Kwesi Mensah",
                "department": "Cell Biology",
                "level": "Level 400",
                "votes": 28,
                "bio": "President of the Departmental Academic Committee with exemplary leadership in student mentorship."
            },
            {
                "code": "103",
                "name": "Abena Osei",
                "department": "Biochemistry",
                "level": "Level 300",
                "votes": 19,
                "bio": "Active student advocate and outstanding performer in molecular biochemistry coursework."
            }
        ]
    },
    {
        "category": "Best Researcher",
        "description": "Honoring exceptional contributions to biological and chemical sciences research.",
        "nominees": [
            {
                "code": "104",
                "name": "Emmanuel Addo",
                "department": "Biochemistry",
                "level": "Level 400",
                "votes": 35,
                "bio": "Published undergraduate researcher investigating bioactive phytochemicals against microbial pathogens."
            },
            {
                "code": "105",
                "name": "Grace Boateng",
                "department": "Cell Biology",
                "level": "Level 400",
                "votes": 24,
                "bio": "Pioneered departmental microfluidics assays for cellular stress response mechanisms."
            }
        ]
    },
    {
        "category": "Best Pals",
        "description": "Celebrating inseparable friendships and dynamic duos across the faculty.",
        "nominees": [
            {
                "code": "106",
                "name": "Ninepence & Oheneba",
                "department": "Biochemistry",
                "level": "Level 400",
                "votes": 51,
                "bio": "Dynamic duo known for campus-wide study circles, lab collaboration, and extracurricular support."
            },
            {
                "code": "107",
                "name": "Kofi & Esi",
                "department": "Cell Biology",
                "level": "Level 300",
                "votes": 33,
                "bio": "Always seen collaborating on lab projects, community volunteering, and student initiatives."
            }
        ]
    },
    {
        "category": "Blogger of the Year",
        "description": "Celebrating student blogs, content creators, and digital storytellers in the ABCOSSA community.",
        "nominees": [
            {
                "code": "108",
                "name": "AGABUS Blogs",
                "department": "Biochemistry",
                "level": "Level 300",
                "votes": 45,
                "bio": "Premier campus lifestyle, tech, and student culture blog with thousands of active weekly readers."
            },
            {
                "code": "109",
                "name": "GEN Z Blogs",
                "department": "Cell Biology",
                "level": "Level 200",
                "votes": 39,
                "bio": "Fast-growing student newsletter and blog highlighting academic tips, opportunities, and youth voices."
            }
        ]
    },
    {
        "category": "Leadership Excellence",
        "description": "Awarded to student leaders demonstrating exemplary dedication to student welfare.",
        "nominees": [
            {
                "code": "110",
                "name": "Nana Yaw Frimpong",
                "department": "Biochemistry",
                "level": "Level 400",
                "votes": 31,
                "bio": "Former General Secretary spearheading digitization of student archives and internship pipelines."
            },
            {
                "code": "111",
                "name": "Dorcas Asantewaa",
                "department": "Cell Biology",
                "level": "Level 300",
                "votes": 26,
                "bio": "Welfare Committee Chairperson championing academic support programs and freshmen orientation."
            }
        ]
    },
    {
        "category": "Most Innovative Project",
        "description": "Celebrating creative scientific solutions and technological innovations.",
        "nominees": [
            {
                "code": "112",
                "name": "BioWaste Fuel Cell Team",
                "department": "Biochemistry",
                "level": "Level 400",
                "votes": 29,
                "bio": "Developed a benchtop microbial fuel cell converting campus cafeteria organic waste to electricity."
            },
            {
                "code": "113",
                "name": "CellVision AI Microscopy",
                "department": "Cell Biology",
                "level": "Level 400",
                "votes": 22,
                "bio": "Created an open-source machine learning tool for automated cell counting in histology slides."
            }
        ]
    }
]

MASTER_SHORTCODE = "*928*667#"
CLEAN_SHORTCODE = "*928*667"
VOTE_PRICE = 1.00

def generate_csv(output_path):
    headers = [
        "Category",
        "Nominee Code",
        "Candidate Name",
        "Department",
        "Level",
        "Direct USSD Dial",
        "Current Votes",
        "Bio / Citation"
    ]
    
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for cat in NOMINEES_DATA:
            for n in cat["nominees"]:
                dial = f"{CLEAN_SHORTCODE}*{n['code']}#"
                writer.writerow([
                    cat["category"],
                    n["code"],
                    n["name"],
                    n.get("department", ""),
                    n.get("level", ""),
                    dial,
                    n.get("votes", 0),
                    n.get("bio", "")
                ])
    print(f"Exported CSV roster to {output_path}")

def generate_html_document():
    total_nominees = sum(len(c["nominees"]) for c in NOMINEES_DATA)
    total_votes = sum(sum(n.get("votes", 0) for n in c["nominees"]) for c in NOMINEES_DATA)
    
    categories_html = ""
    for cat in NOMINEES_DATA:
        rows_html = ""
        for n in cat["nominees"]:
            dial_code = f"{CLEAN_SHORTCODE}*{n['code']}#"
            rows_html += f"""
            <tr>
                <td style="text-align: center;"><span class="code-badge">#{n['code']}</span></td>
                <td>
                    <div style="font-weight: 700; color: #0f172a; font-size: 13px;">{n['name']}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">{n.get('bio', '')}</div>
                </td>
                <td>
                    <span class="dept-badge">{n.get('department', 'Biochemistry')}</span>
                    <span style="font-size: 11px; color: #64748b; margin-left: 4px;">{n.get('level', '')}</span>
                </td>
                <td>
                    <span class="dial-code">{dial_code}</span>
                </td>
                <td style="text-align: right; font-weight: 800; color: #e11d48; font-size: 13px;">
                    {n.get('votes', 0)}
                </td>
            </tr>
            """
        
        categories_html += f"""
        <div class="category-section">
            <div class="category-header">
                <div>
                    <h2 class="category-title">{cat['category']}</h2>
                    <p class="category-desc">{cat.get('description', '')}</p>
                </div>
                <span class="count-pill">{len(cat['nominees'])} Candidates</span>
            </div>
            <table class="roster-table">
                <thead>
                    <tr>
                        <th style="width: 80px; text-align: center;">USSD Code</th>
                        <th>Nominee & Citation</th>
                        <th style="width: 170px;">Department & Level</th>
                        <th style="width: 170px;">Direct Dial String</th>
                        <th style="width: 70px; text-align: right;">Votes</th>
                    </tr>
                </thead>
                <tbody>
                    {rows_html}
                </tbody>
            </table>
        </div>
        """
        
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ABCOSSA Dinner Awards 2026 - Nominees Directory</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700;800&display=swap');

    * {{
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }}

    body {{
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        background: #ffffff;
        color: #0f172a;
        padding: 40px;
        max-width: 1200px;
        margin: 0 auto;
    }}

    .doc-header {{
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 3px solid #0d9488;
        padding-bottom: 24px;
        margin-bottom: 24px;
    }}

    .doc-title {{
        font-size: 28px;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.5px;
    }}

    .doc-subtitle {{
        font-size: 14px;
        color: #64748b;
        font-weight: 500;
        margin-top: 4px;
    }}

    .org-badge {{
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #0d9488;
        margin-bottom: 4px;
    }}

    .banner-grid {{
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 16px;
        margin-bottom: 32px;
    }}

    .info-card {{
        background: #f8fafc;
        border: 1.5px solid #e2e8f0;
        border-radius: 14px;
        padding: 16px 20px;
    }}

    .info-card.primary {{
        background: #f0fdfa;
        border-color: #5eead4;
    }}

    .info-label {{
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #64748b;
    }}

    .info-card.primary .info-label {{
        color: #0f766e;
    }}

    .info-value {{
        font-size: 20px;
        font-weight: 800;
        color: #0f172a;
        margin-top: 4px;
        font-family: 'JetBrains Mono', monospace;
    }}

    .category-section {{
        margin-bottom: 36px;
        page-break-inside: avoid;
    }}

    .category-header {{
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 8px;
        margin-bottom: 14px;
    }}

    .category-title {{
        font-size: 17px;
        font-weight: 800;
        color: #0f766e;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}

    .category-desc {{
        font-size: 11.5px;
        color: #64748b;
        margin-top: 2px;
    }}

    .count-pill {{
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        background: #e2e8f0;
        border-radius: 100px;
        color: #475569;
    }}

    .roster-table {{
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }}

    .roster-table th {{
        background: #f8fafc;
        color: #475569;
        font-weight: 700;
        padding: 10px 12px;
        border-bottom: 1.5px solid #cbd5e1;
        text-align: left;
    }}

    .roster-table td {{
        padding: 12px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
    }}

    .code-badge {{
        font-family: 'JetBrains Mono', monospace;
        font-weight: 800;
        font-size: 12px;
        background: #0f172a;
        color: #ffffff;
        padding: 4px 8px;
        border-radius: 6px;
        display: inline-block;
    }}

    .dept-badge {{
        font-size: 11px;
        font-weight: 600;
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
        padding: 2px 6px;
        border-radius: 4px;
    }}

    .dial-code {{
        font-family: 'JetBrains Mono', monospace;
        font-weight: 700;
        color: #0d9488;
        font-size: 12px;
    }}

    .doc-footer {{
        margin-top: 40px;
        border-top: 1px solid #e2e8f0;
        padding-top: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #94a3b8;
    }}
</style>
</head>
<body>

    <div class="doc-header">
        <div>
            <div class="org-badge">Association of Biochemistry & Cell Biology Students</div>
            <h1 class="doc-title">ABCOSSA Dinner Awards 2026</h1>
            <p class="doc-subtitle">Official Nominee Code Directory & USSD Dialing Reference</p>
        </div>
        <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 700; color: #0f172a;">Telecom Gateway</div>
            <div style="font-size: 13px; font-weight: 800; color: #0d9488;">Arkesel / Hubtel / Paystack</div>
        </div>
    </div>

    <div class="banner-grid">
        <div class="info-card primary">
            <div class="info-label">Master USSD Shortcode</div>
            <div class="info-value">{MASTER_SHORTCODE}</div>
            <div style="font-size: 11.5px; color: #0f766e; margin-top: 4px;">
                Dial on any mobile network (MTN, Telecel, AT) to enter candidate code directly.
            </div>
        </div>

        <div class="info-card">
            <div class="info-label">Voting Rate</div>
            <div class="info-value">GHS {VOTE_PRICE:.2f}</div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">
                Per vote (MoMo enabled)
            </div>
        </div>

        <div class="info-card">
            <div class="info-label">Total Nominees</div>
            <div class="info-value">{total_nominees}</div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">
                Across {len(NOMINEES_DATA)} categories
            </div>
        </div>
    </div>

    {categories_html}

    <div class="doc-footer">
        <span>Association of Biochemistry & Cell Biology Students (ABCOSSA)</span>
        <span>Online Portal: https://abcossa.org/nominees • Verified Official Catalog</span>
    </div>

</body>
</html>
"""
    return html

def generate_pdf():
    output_html_path = os.path.abspath("ABCOSSA_Nominees_Roster.html")
    output_pdf_path = os.path.abspath("ABCOSSA_Nominees_Roster.pdf")
    output_csv_path = os.path.abspath("ABCOSSA_Nominees_Roster.csv")

    # Generate CSV
    generate_csv(output_csv_path)

    # Generate HTML
    html_content = generate_html_document()
    with open(output_html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"Wrote HTML roster to {output_html_path}")

    # Generate PDF via Playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"file:///{output_html_path.replace(os.sep, '/')}")
        page.wait_for_load_state("networkidle")
        
        page.pdf(
            path=output_pdf_path,
            format="A4",
            print_background=True,
            margin={"top": "15mm", "right": "15mm", "bottom": "15mm", "left": "15mm"},
        )
        browser.close()

    print(f"Successfully generated PDF roster at {output_pdf_path}")

if __name__ == "__main__":
    generate_pdf()
