// simple login; on success store institute in localStorage and redirect to /dashboard
const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.innerText = "";

  const data = {
    username: form.username.value.trim(),
    password: form.password.value,
  };

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      msg.style.color = "crimson";
      msg.innerText = result.error || "Login failed";
      return;
    }

    // save institute data locally and redirect
    localStorage.setItem("mscitinstitute", JSON.stringify(result.institute));
    window.location.href = "/dashboard";
  } catch (err) {
    msg.style.color = "crimson";
    msg.innerText = "Network error";
  }
});
