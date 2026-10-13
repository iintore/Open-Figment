// Device and paper sizes offered by the Frame tool.
export const FRAME_PRESETS: { group: string; items: [string, number, number][] }[] = [
  {
    group: 'Phone',
    items: [
      ['iPhone 16', 393, 852],
      ['iPhone 16 Pro', 402, 874],
      ['iPhone 16 Pro Max', 440, 956],
      ['iPhone SE', 320, 568],
      ['Android Compact', 412, 917],
      ['Android Medium', 700, 840],
    ],
  },
  {
    group: 'Tablet',
    items: [
      ['iPad mini 8.3', 744, 1133],
      ['iPad Pro 11"', 834, 1194],
      ['iPad Pro 12.9"', 1024, 1366],
      ['Surface Pro 8', 1440, 960],
    ],
  },
  {
    group: 'Desktop',
    items: [
      ['MacBook Air', 1280, 832],
      ['MacBook Pro 14"', 1512, 982],
      ['Desktop', 1440, 1024],
      ['Wireframe', 1440, 1024],
      ['TV', 1280, 720],
    ],
  },
  { group: 'Presentation', items: [['Slide 16:9', 1920, 1080], ['Slide 4:3', 1024, 768]] },
  { group: 'Watch', items: [['Apple Watch 45mm', 198, 242], ['Apple Watch 41mm', 176, 215]] },
  { group: 'Paper', items: [['A4', 595, 842], ['A5', 420, 595], ['Letter', 612, 792], ['Tabloid', 792, 1224]] },
  {
    group: 'Social media',
    items: [
      ['Instagram post', 1080, 1350],
      ['Instagram story', 1080, 1920],
      ['X post', 1200, 675],
      ['Facebook cover', 820, 312],
      ['LinkedIn post', 1200, 1200],
    ],
  },
];
