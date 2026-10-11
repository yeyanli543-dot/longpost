import React from 'react';
import { Link } from 'react-router-dom';

export interface UniversalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to?: string;
  href?: string;
  children?: React.ReactNode;
}

export const UniversalLink: React.FC<UniversalLinkProps> = ({
  to,
  href,
  children,
  ...props
}) => {
  const target = to || href || '#';
  const isExternal = /^https?:\/\//i.test(target) || target.startsWith('//');

  if (isExternal) {
    return (
      <a href={target} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link to={target} {...(props as any)}>
      {children}
    </Link>
  );
};
