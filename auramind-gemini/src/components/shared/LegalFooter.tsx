import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from '@/components/icons';
import {
  CONTACT_EMAIL,
  LEGAL_COPYRIGHT_LINE,
  PRODUCT_NAME,
} from '../../lib/branding';

/**
 * Footer for the legal/public pages.
 *
 * Mounted on Privacy Policy + Terms of Service + any future public page that
 * doesn't sit behind the dashboard chrome. The dashboard's own sidebar already
 * carries the product brand; we don't double up.
 *
 * This used to be CogniVectFooter and rendered a parent-company attribution
 * block — "BonaMind — a CogniVect product", "by CogniVect", an /covect
 * tagline and a link to cogniavect.app. CogniVect, Inc. is being dissolved, so
 * that copy is gone: it was marketing, and a dissolved company is not a
 * marketing asset.
 *
 * What remains is deliberately small. The copyright line still names the
 * operating entity, which is the one part here that is a legal statement
 * rather than presentation — see the FROZEN block in lib/branding.ts. It is
 * wrong until the replacement entity is confirmed, and that is deliberate:
 * the alternative is silently dropping a copyright notice, which is worse.
 */
interface LegalFooterProps {
  /** Override the link target for the "About" anchor. */
  aboutHref?: string;
  /** When true, render only the copyright line (for tight footers). */
  compact?: boolean;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({
  aboutHref = '/about',
  compact = false,
}) => {
  return (
    <div className="mt-10 pt-6 border-t border-[#2A2A3A]/30">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-[11px] text-[#7A7A96] leading-relaxed">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[#9090A8]">{PRODUCT_NAME}</span>
            <span className="text-[#7A7A96]">·</span>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#7A7A96] hover:text-[#9090A8] underline-offset-2 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            {!compact && (
              <>
                <span className="text-[#7A7A96] opacity-60">·</span>
                <Link
                  to={aboutHref}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:text-[#9090A8] hover:underline"
                >
                  About {PRODUCT_NAME}
                  <ArrowUpRight size={10} />
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="text-[10px] text-[#3A3A4F]">{LEGAL_COPYRIGHT_LINE}</div>
      </div>
    </div>
  );
};

export default LegalFooter;