let serviceList = [];

let selectedService = null;

const servicesEl =
    document.getElementById("services");

const dateEl =
    document.getElementById("date");

const timeEl =
    document.getElementById("time");

const form =
    document.getElementById("bookingForm");

const alertEl =
    document.getElementById("alert");

const submitButton =
    document.getElementById("submitButton");

const today = new Date();

const todayString =
    new Date(
        today.getTime() -
        today.getTimezoneOffset() * 60000
    )
    .toISOString()
    .split("T")[0];

dateEl.min =
    todayString;

dateEl.value =
    todayString;

function money(value) {
    return `R${Number(value).toLocaleString("en-ZA")}`;
}

function showAlert(
    message,
    success = false
) {
    alertEl.textContent =
        message;

    alertEl.classList.remove(
        "hidden"
    );

    if (success) {
        alertEl.style.background =
            "#14270e";

        alertEl.style.color =
            "#d8ff3e";
    } else {
        alertEl.style.background = "";
        alertEl.style.color = "";
    }
}

function hideAlert() {
    alertEl.classList.add(
        "hidden"
    );
}

function renderServices() {

    servicesEl.innerHTML =
        serviceList
        .map(
            (service, index) => `
          <div class="service-option">

            <input
              type="radio"
              id="service-${service.id}"
              name="serviceId"
              value="${service.id}"
              ${index === 0 ? "checked" : ""}
            >

            <label
              class="service-label"
              for="service-${service.id}"
            >

              <div>

                <div class="service-name">
                  ${service.name}
                </div>

                <div class="service-desc">
                  ${service.description}
                </div>

              </div>

              <div class="service-meta">

                <div class="service-price">
                  ${money(service.price)}
                </div>

                <div class="service-duration">
                  ${service.duration} min
                </div>

              </div>

            </label>

          </div>
        `
        )
        .join("");

    selectedService =
        serviceList[0] ||
        null;

    servicesEl.addEventListener(
        "change",
        event => {

            if (
                event.target.name ===
                "serviceId"
            ) {

                selectedService =
                    serviceList.find(
                        service =>
                        service.id ===
                        event.target.value
                    );

                updateSummary();

                loadAvailability();
            }
        }
    );

    updateSummary();
}

function updateSummary() {

    document.getElementById(
            "summaryService"
        ).textContent =
        selectedService ?
        selectedService.name :
        "Select a service";

    document.getElementById(
            "summaryPrice"
        ).textContent =
        selectedService ?
        money(selectedService.price) :
        "R0";

    if (
        dateEl.value &&
        timeEl.value
    ) {

        document.getElementById(
                "summaryDate"
            ).textContent =
            `${dateEl.value} at ${timeEl.value}`;

    } else {

        document.getElementById(
                "summaryDate"
            ).textContent =
            "Select a date and time";
    }
}

async function loadAvailability() {

    if (!selectedService ||
        !dateEl.value
    ) {
        return;
    }

    timeEl.disabled =
        true;

    timeEl.innerHTML =
        `<option>Checking availability...</option>`;

    try {

        const response =
            await fetch(
                `/api/availability?date=${encodeURIComponent(
          dateEl.value
        )}&serviceId=${encodeURIComponent(
          selectedService.id
        )}`
            );

        const data =
            await response.json();

        timeEl.innerHTML =
            "";

        if (data.closed) {

            timeEl.innerHTML =
                `<option value="">
          Closed on this day
        </option>`;

            document.getElementById(
                    "availabilityNote"
                ).textContent =
                "The shop is closed on this day.";

            updateSummary();

            return;
        }

        if (!data.slots.length) {

            timeEl.innerHTML =
                `<option value="">
          No available times
        </option>`;

            document.getElementById(
                    "availabilityNote"
                ).textContent =
                "No appointments are available for this date.";

            updateSummary();

            return;
        }

        timeEl.disabled =
            false;

        timeEl.innerHTML = `
  <option value="">
    Choose a time
  </option>
` +
            data.slots
            .map(slot => {

                if (slot.booked) {
                    return `
        <option
          value=""
          disabled
        >
          ${slot.start} – ${slot.end} — BOOKED
        </option>
      `;
                }

                if (slot.disabled) {
                    return `
        <option
          value=""
          disabled
        >
          ${slot.start} – ${slot.end} — UNAVAILABLE
        </option>
      `;
                }

                return `
      <option value="${slot.start}">
        ${slot.start} – ${slot.end}
      </option>
    `;
            })
            .join("");

        document.getElementById(
                "availabilityNote"
            ).textContent =
            `${data.slots.length} appointment time${
        data.slots.length === 1
          ? ""
          : "s"
      } available.`;

    } catch {

        timeEl.innerHTML =
            `<option value="">
        Could not load times
      </option>`;

        document.getElementById(
                "availabilityNote"
            ).textContent =
            "Please refresh and try again.";
    }

    updateSummary();
}

dateEl.addEventListener(
    "change",
    () => {
        hideAlert();

        loadAvailability();
    }
);

timeEl.addEventListener(
    "change",
    updateSummary
);

form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            hideAlert();

            if (!selectedService ||
                !timeEl.value
            ) {

                showAlert(
                    "Please select a service and appointment time."
                );

                return;
            }

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Confirming...";

            const formData =
                new FormData(form);

            const payload = {

                serviceId: formData.get(
                    "serviceId"
                ),

                date: formData.get(
                    "date"
                ),

                startTime: formData.get(
                    "time"
                ),

                customerName: formData.get(
                    "customerName"
                ),

                customerPhone: formData.get(
                    "customerPhone"
                ),

                notes: formData.get(
                    "notes"
                )
            };

            try {

                const response =
                    await fetch(
                        "/api/bookings", {
                            method: "POST",

                            headers: {
                                "Content-Type": "application/json"
                            },

                            body: JSON.stringify(
                                payload
                            )
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        "Booking failed."
                    );
                }

                const booking =
                    data.booking;

                document.querySelector(
                    ".booking-card"
                ).innerHTML = `

        <div
          style="
            text-align:center;
            padding:35px 10px;
          "
        >

          <p class="eyebrow">
            BOOKING CONFIRMED
          </p>

          <h2
            style="
              font-size:2.5rem;
              letter-spacing:-.05em;
            "
          >
            You're booked.
          </h2>

          <p class="muted">
            Reference:
            <strong>
              ${booking.booking_ref}
            </strong>
          </p>

          <div
            class="summary"
            style="
              text-align:left;
              margin:28px 0;
            "
          >

            <div>

              <h3>
                ${booking.service_name}
              </h3>

              <p class="muted">
                ${booking.appointment_date}
                •
                ${booking.start_time}
                –
                ${booking.end_time}
              </p>

              <p class="muted">
                ${booking.customer_name}
              </p>

            </div>

            <strong>
              ${money(booking.price)}
            </strong>

          </div>

          ${
            data.whatsappSentAutomatically

              ? `
                <p class="muted">
                  Your booking has been
                  sent to the barbershop's
                  WhatsApp.
                </p>
              `

              : `
                <a
                  class="button primary full"
                  href="${data.whatsappUrl}"
                  target="_blank"
                  rel="noopener"
                >
                  Send booking to WhatsApp
                </a>

                <p
                  class="muted"
                  style="margin-top:12px;"
                >
                  Tap the button to send
                  your booking details to
                  BrandItWithBrandon.
                </p>
              `
          }

          <a
            href="/"
            class="button secondary full"
          >
            Make another booking
          </a>

        </div>
      `;

    } catch (error) {

      showAlert(
        error.message
      );

    } finally {

      submitButton.disabled =
        false;

      submitButton.textContent =
        "Confirm Appointment";
    }
  }
);

async function init() {

  try {
    const configResponse = await fetch("/api/config");
    const config = await configResponse.json();
    if (config.settings && config.settings.hero_background) {
      const hero = document.querySelector(".hero");
      hero.style.backgroundImage = `linear-gradient(rgba(5,6,7,.72), rgba(5,6,7,.9)), url("${config.settings.hero_background}")`;
      hero.style.backgroundPosition = "center";
      hero.style.backgroundSize = "cover";
    }
  } catch {}

  document.getElementById(
    "year"
  ).textContent =
    new Date()
      .getFullYear();

  try {

    const response =
      await fetch(
        "/api/services"
      );

    serviceList =
      await response.json();

    renderServices();

    await loadAvailability();

  } catch {

    showAlert(
      "Could not load the booking system."
    );
  }
}

init();