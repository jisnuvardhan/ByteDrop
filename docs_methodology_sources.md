# Methodology source notes

- ASHRAE AI Data Center Framework, Energy and Thermal Efficiency: https://www.ashrae.org/technical-resources/ai-data-center-framework/energy-and-thermal-efficiency
  - Describes AI data-center energy and thermal efficiency, recommends measuring PUE, WUE, and related metrics, and emphasizes workload, cooling architecture, and facility variation.
- Microsoft, Measuring energy and water efficiency for Microsoft datacenters: https://datacenters.microsoft.com/sustainability/efficiency/
  - Defines PUE as facility energy divided by IT energy and WUE as annual cooling/humidification liters divided by annual IT kWh. Published FY25 global context: PUE 1.17 and WUE 0.27 L/kWh.
- Mytton, Data centre water consumption, npj Clean Water (2021): https://www.nature.com/articles/s41545-021-00101-w
  - Distinguishes water consumption from withdrawal and discusses direct cooling plus indirect electricity-generation water. Reports a US 2015 electricity-generation average of 2.18 L/kWh and notes large variation by generation technology.
- Google Data Centers, Power efficiency: https://datacenters.google/efficiency/
  - Reports fleet PUE as an operational metric and explains that PUE closer to 1.0 indicates less facility overhead.

These sources are context for explicit fallback factors only. They do not prove the location, hardware, cooling system, or energy source for an individual request. The product labels fallback values as estimates and retains source/version/effective-date metadata.
