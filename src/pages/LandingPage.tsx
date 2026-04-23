import { EmailPasswordAuthForm } from '@/components/EmailPasswordAuthForm'
import { supabaseConfigured } from '@/lib/supabase'

export function LandingPage() {
  return (
    <div className="landing page">
      <div className="landing__glow" aria-hidden />
      <header className="landing__hero">
        <h1 className="landing__title">GistPrism</h1>
        <p className="landing__lead">Filter and summarize the internet.</p>
      </header>

      <div className="landing__grid">
        <div className="landing__main">
          <section className="landing__panel" aria-labelledby="landing-spec-heading">
            <h2 id="landing-spec-heading" className="landing__section-title">
              You specify:
            </h2>
            <ul className="landing__list">
              <li>the websites producing content you want (news sites, blogs, etc)</li>
              <li>the rules about what you want and don&apos;t want to see.</li>
            </ul>
          </section>

          <section className="landing__panel landing__panel--accent" aria-labelledby="landing-then-heading">
            <h2 id="landing-then-heading" className="landing__section-title">
              GistPrism then:
            </h2>
            <ul className="landing__list">
              <li>filters all content per your specs</li>
              <li>organizes and summarizes the content (because it is never as concise as it should be.)</li>
            </ul>
          </section>

          <div className="landing__story">
            <p>I like it becaues the knowlege I gain per minute consuming content is substantially increased.</p>
            <p>
              I use it to consume about 20 substacks, cbc news, hacker news (heavily filtered) and tech crunch (somewaht
              filtered)
            </p>
            <p>
              If you try it you can start with my filters and you&apos;ll see how it works.&nbsp;&nbsp;You can then
              modify.
            </p>
            <p>I use it every day.</p>
          </div>
        </div>

        <aside className="landing__aside" aria-labelledby="landing-signup-label">
          <div className="landing__signup-card">
            {supabaseConfigured ? (
              <EmailPasswordAuthForm defaultMode="signup" submitButtonClassName="btn btn--primary landing__submit" />
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Configure Supabase environment variables to enable authentication.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
