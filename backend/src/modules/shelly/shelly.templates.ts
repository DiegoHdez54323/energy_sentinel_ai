export const SHELLY_CONNECTED_HTML = `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Autenticación completada</title>
  </head>
  <body style="
    margin:0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, #f8fafc, #eef2ff);
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:100vh;
    color:#111827;
  ">
    <div style="
      background:#ffffff;
      padding:32px;
      border-radius:18px;
      box-shadow:0 12px 32px rgba(31, 41, 55, 0.10);
      max-width:420px;
      width:90%;
      text-align:center;
      border:1px solid #e5e7eb;
    ">
      <div style="
        width:64px;
        height:64px;
        margin:0 auto 16px;
        border-radius:9999px;
        background:#dcfce7;
        color:#16a34a;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:32px;
        font-weight:700;
      ">✓</div>

      <h1 style="margin:0 0 8px; font-size:22px;">Shelly conectado</h1>

      <p style="margin:0; color:#4b5563; font-size:15px; line-height:1.5;">
        La autenticación se completó correctamente.<br/>
        <strong style="color:#111827;">Ya puedes regresar a la app</strong> y cerrar esta ventana.
      </p>

      <div style="margin-top:18px; font-size:12px; color:#6b7280;">
        Puedes cerrar esta pestaña cuando quieras.
      </div>
    </div>
  </body>
</html>
`;
