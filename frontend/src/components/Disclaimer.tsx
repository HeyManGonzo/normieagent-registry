export function Disclaimer() {
  return (
    <section className="disclaimer">
      <p className="hero-eyebrow">LEGAL</p>
      <h1 className="hero-title">DISCLAIMER</h1>
      <p className="muted disclaimer-date">Last updated: May 2026</p>

      <div className="disclaimer-body">
        <div className="disclaimer-section">
          <h2 className="disclaimer-heading">No affiliation with the Normies team</h2>
          <p>
            NormieAgent Registry is an independent community project. It is not
            affiliated with, endorsed by, or in any way connected to the Normies
            team, normies.art, or any related entities. The Normies brand,
            artwork, and NFT collection belong to their respective owners. Use of
            the Normies name on this site is purely descriptive — to identify the
            NFT collection whose holders this service is designed for.
          </p>
        </div>

        <div className="disclaimer-section">
          <h2 className="disclaimer-heading">No liability for subdomain content</h2>
          <p>
            This service provides DNS subdomain registration only. We do not
            host, control, monitor, or review any content published at
            subdomains registered through this registry. Each subdomain holder
            is solely responsible for the content, services, and activities
            accessible via their subdomain. We accept no liability whatsoever
            for any content, claims, damages, or losses arising from the use of
            any registered subdomain.
          </p>
          <p>
            We reserve the right to deactivate any subdomain that is reported
            to host illegal content, malware, phishing, or other harmful
            material, without prior notice.
          </p>
        </div>

        <div className="disclaimer-section">
          <h2 className="disclaimer-heading">Service provided as-is</h2>
          <p>
            This service is provided on an <em>as-is</em> and <em>as-available</em>{" "}
            basis, without warranty of any kind — express or implied. We make no
            guarantees regarding uptime, availability, continuity, or
            correctness of routing. The service may be interrupted, modified, or
            discontinued at any time without notice.
          </p>
          <p>
            Subdomain routing is tied to on-chain NFT ownership. If the Normie
            associated with a subdomain is transferred to a different wallet, the
            subdomain will be automatically reassigned to the new owner. We are
            not liable for any disruption this causes.
          </p>
        </div>

        <div className="disclaimer-section">
          <h2 className="disclaimer-heading">Current pricing and availability</h2>
          <p>
            Registration is free of charge. Both methods — connecting your
            wallet directly and signing via a third-party tool such as Etherscan
            — are available at no cost through{" "}
            <strong>31 December 2026</strong>.
          </p>
          <p>
            Pricing and terms may change after 31 December 2026. Subdomains
            that are active and in good standing at that date will not be
            affected without reasonable advance notice.
          </p>
        </div>

        <div className="disclaimer-section disclaimer-section-last">
          <h2 className="disclaimer-heading">Contact</h2>
          <p>
            Questions or concerns? Email{" "}
            <a href="mailto:ramona@normieagent.com">
              ramona@normieagent.com
            </a>{" "}
            or reach out on X at{" "}
            <a
              href="https://x.com/heymangonzo"
              target="_blank"
              rel="noopener noreferrer"
            >
              @heymangonzo
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
