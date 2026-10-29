const form = document.querySelector("form");
const input = document.querySelector("#password");
const error = document.querySelector(".error");
const button = document.querySelector("button");
// The server decides where a login lands: it checks returnTo and answers with a safe redirectTo.
const returnTo = new URLSearchParams(window.location.search).get("next") || "/testing";

form.addEventListener("submit", async (event) => {
  event.preventDefault(); error.textContent = ""; button.disabled = true; button.textContent = "Checking…";
  try {
    const response = await fetch("/_ideal-day/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: input.value, returnTo }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "That password was not accepted.");
    input.value = ""; window.location.assign(payload.redirectTo || "/testing");
  } catch (caught) {
    error.textContent = caught instanceof Error ? caught.message : "That password was not accepted.";
    input.select(); button.disabled = false; button.textContent = "Continue";
  }
});
