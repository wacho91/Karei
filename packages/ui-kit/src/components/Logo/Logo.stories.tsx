import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = {
  title: 'Brand/Logo',
  component: Logo,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'radio', options: ['full', 'mark'] },
    tone: { control: 'radio', options: ['brand', 'mono', 'inverse'] },
    size: { control: { type: 'range', min: 16, max: 96, step: 4 } },
    animated: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Logo>;

export const Full: Story = {
  args: { variant: 'full', size: 40, tone: 'brand' },
};

export const Mark: Story = {
  args: { variant: 'mark', size: 48, tone: 'brand' },
};

export const Animated: Story = {
  args: { variant: 'full', size: 40, tone: 'brand', animated: true },
};

export const Inverse: Story = {
  args: { variant: 'full', size: 40, tone: 'inverse' },
  parameters: { backgrounds: { default: 'dark' } },
};

export const Mono: Story = {
  args: { variant: 'full', size: 40, tone: 'mono' },
};
