package com.twitsticker.app;

import java.util.ArrayList;
import java.util.List;

public class StickerPack {
    public String identifier;
    public String name;
    public String publisher;
    public String trayImageFile;
    public String publisherEmail = "";
    public String publisherWebsite = "";
    public String privacyPolicyWebsite = "";
    public String licenseAgreementWebsite = "";
    public String imageDataVersion = "2";
    public boolean avoidCache = false;
    public boolean animatedStickerPack = true;
    public String androidPlayStoreLink = "";
    public String iosAppStoreLink = "";

    public List<Sticker> stickers = new ArrayList<>();

    public StickerPack(String identifier, String name, String publisher, String trayImageFile) {
        this.identifier = identifier;
        this.name = name;
        this.publisher = publisher;
        this.trayImageFile = trayImageFile;
    }
}

