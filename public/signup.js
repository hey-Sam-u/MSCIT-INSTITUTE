const form = document.getElementById("signupForm");
const otpDiv = document.getElementById("otpDiv");
const otpInput = document.getElementById("otpInput");
const verifyBtn = document.getElementById("verifyOtpBtn");
const message = document.getElementById("message");

let userEmail = "";

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(form);
  const data = {};
  formData.forEach((v, k) => (data[k] = v));
  userEmail = data.admin_email;

  const res = await fetch("/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (res.ok) {
    message.style.color = "green";
    message.innerText = result.message;
    form.style.display = "none";
    otpDiv.style.display = "block";
  } else {
    message.style.color = "red";
    message.innerText = result.error || JSON.stringify(result.errors);
  }
});

verifyBtn.addEventListener("click", async () => {
  const otp = otpInput.value;
  const res = await fetch("/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, otp }),
  });
  const result = await res.json();
  if (res.ok) {
    message.innerText = result.message;
    otpDiv.style.display = "none";
  } else {
    message.innerText = result.error;
  }
});
