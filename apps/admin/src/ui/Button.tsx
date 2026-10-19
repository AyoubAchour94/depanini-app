import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
}

export function Button({ variant = 'default', className, type = 'button', ...rest }: Props) {
  const classes = ['button', variant !== 'default' && `button--${variant}`, className];
  return <button type={type} className={classes.filter(Boolean).join(' ')} {...rest} />;
}
