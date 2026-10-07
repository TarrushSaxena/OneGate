"""Build the readable policy handbook from the application's policy sources."""
import json, sys, subprocess
from pathlib import Path
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor

root=Path(__file__).resolve().parents[1]
articles=json.loads(subprocess.check_output(['node','-e',"process.stdout.write(JSON.stringify([...require('./backend/data/knowledge-base').kbArticles,...require('./backend/data/fake-data').kbArticles]))"],cwd=root).decode('utf-8'))
target=Path(__file__).resolve().parents[1]/'backend'/'data'/'policy-pdfs'/'company-policies.pdf'
target.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles.add(ParagraphStyle('PolicyTitle',fontName='Helvetica-Bold',fontSize=24,leading=29,textColor=HexColor('#244f3c'),spaceAfter=18))
styles.add(ParagraphStyle('PolicyBody',fontSize=11,leading=17,spaceAfter=14))
styles.add(ParagraphStyle('PolicySource',fontSize=9,leading=13,textColor=HexColor('#64816c'),spaceAfter=15))
story=[Paragraph('OneGate',styles['PolicyTitle']),Paragraph('Company policy handbook',styles['Title']),Spacer(1,24),Paragraph('All policy articles available in the OneGate knowledge base. These are the source policies used by the assistant.',styles['PolicyBody']),Paragraph(f'{len(articles)} articles',styles['PolicySource']),Spacer(1,20)]
for department in sorted({a['department'] for a in articles}):
    story.append(Paragraph(escape(department),styles['Heading2']))
    for a in articles:
        if a['department']==department:story.append(Paragraph(escape(a['title']),styles['PolicySource']))
for article in articles:
    story.extend([PageBreak(),Paragraph(escape(article['department']).upper(),styles['PolicySource']),Paragraph(escape(article['title']),styles['PolicyTitle']),Paragraph(escape(article.get('source_citation') or article.get('source') or article['department']+' policy source'),styles['PolicySource'])])
    for text in article['content'].split('\n'):
        if text.strip():story.append(Paragraph(escape(text),styles['PolicyBody']))
def footer(canvas,doc):
    canvas.setStrokeColor(HexColor('#dce6d8'));canvas.line(48,45,547,45)
    canvas.setFont('Helvetica',8);canvas.setFillColor(HexColor('#64816c'))
    canvas.drawString(48,30,'ONEGATE / COMPANY POLICIES');canvas.drawRightString(547,30,str(doc.page))
SimpleDocTemplate(str(target),rightMargin=48,leftMargin=48,topMargin=48,bottomMargin=60,title='OneGate company policies').build(story,onFirstPage=footer,onLaterPages=footer)
print(str(target))
