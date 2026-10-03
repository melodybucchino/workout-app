export default async function progress(ctx) {
  ctx.app.innerHTML = `
    <h1 class="display page-title">Progress</h1>
    <div class="card coming">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16"/><path d="M7.5 15l3.5-4 3 2.5 4.5-6"/></svg>
      <h2>Coming soon</h2>
      <p>Charts of your lifts and runs over time will live here.</p>
    </div>
  `;
}
