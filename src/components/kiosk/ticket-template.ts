export const TICKET_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Attendance Receipt</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 0;
      }

      html, body {
        width: 80mm;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
        display: block;
      }

      [hidden] {
        display: none !important;
      }

      .header {
        width: 80mm;
        padding: 2mm 3mm 0;
        box-sizing: border-box;
        text-align: center;
      }

      .logo {
        display: block;
        width: 16mm;
        height: auto;
        margin: 0 auto 1mm;
        filter: grayscale(1);
      }

      .org {
        font-size: 11pt;
        font-weight: 700;
        line-height: 1.1;
        color: #000;
      }

      .receipt {
        width: 80mm;
        margin: 0 !important;
        padding: 0 3mm;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4mm;
      }

      .number {
        font-size: 50pt;
        font-weight: 900;
        line-height: 1;
        color: #000;
        flex-shrink: 0;
      }

      .name {
        font-size: 16pt;
        font-weight: 700;
        line-height: 1.1;
        text-align: center;
        color: #000;
        overflow-wrap: anywhere;
        flex: 0 1 auto;
      }

      .time {
        width: 80mm;
        padding: 0 3mm 2mm;
        box-sizing: border-box;
        text-align: center;
        font-size: 9pt;
        color: #000;
      }
    </style>
  </head>
  <body>
    <div class="header" hidden>
      <img class="logo" src="/logo.png" alt="" hidden>
      <div class="org" hidden></div>
    </div>
    <div class="receipt">
      <div class="number"></div>
      <div class="name"></div>
    </div>
    <div class="time" hidden></div>
  </body>
</html>`;
