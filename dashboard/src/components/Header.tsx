import React from 'react';
import { Sidebar, type SidebarProps } from './Sidebar';

export const Header: React.FC<SidebarProps> = (props) => {
  return <Sidebar {...props} />;
};

export default Header;

